import fs from "fs";
import postgres from "postgres";

/**
 * Repara los dos desajustes que dejó el cron de cobro caído (ver
 * /api/pagos/oneclick/cobrar, que exportaba POST y Vercel invoca con GET):
 *
 *  1. Clientes que PAGARON (cualquier medio: efectivo, transferencia, tarjeta
 *     en mesón, Webpay, Oneclick) y aun así figuran vencidos hoy, porque
 *     vencimientoAnclado() saltó el ciclo que se perdió y aterrizó en el borde
 *     siguiente en vez de darles el mes pagado. Se les deja
 *     `fecha de pago + 1 mes - 1 día`.
 *
 *  2. Suscripciones activas cuyo `proximo_cobro` quedó ANTES del vencimiento
 *     del cliente. Ese desfase es el que haría cobrar de nuevo, al reactivarse
 *     el cron, a gente que ya pagó por otro medio (KRBZ65 pagó por Webpay el
 *     27/08, DYDJ71 el 26/08). El cobro toca cuando se acaba el plan, así que
 *     `proximo_cobro` se alinea al vencimiento.
 *
 * NO toca a los que pagaron atrasado dentro del plazo de gracia y conservan su
 * fecha anclada (ver PagoAtrasadoSection: "mantiene su fecha de vencimiento, o
 * sea que el próximo vence un mes después del anterior y no un mes después del
 * día que pagó"). Esos figuran con 1-2 días "de menos" y es la regla del
 * negocio funcionando, no un error.
 *
 * Dry-run por defecto. Escribe con `--apply`, y siempre deja respaldo CSV.
 */

const APLICAR = process.argv.includes("--apply");

const PLAN_TIPOS = `(
  v.es_servicio_adicional is not true
  and (v.tipo ilike 'Plan nuevo%' or v.tipo ilike 'Renovaci%' or v.tipo ilike 'Reactivaci%' or v.tipo ilike 'Upgrade%')
)`;

function csv(filas: readonly Record<string, unknown>[]): string {
  if (!filas.length) return "";
  const cols = Object.keys(filas[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...filas.map((f) => cols.map((c) => esc(f[c])).join(","))].join("\n");
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

  // --- 1. Vencimientos a corregir -------------------------------------------
  const aCorregir = await sql.unsafe(`
    with pago as (
      select distinct on (v.cliente_id) v.cliente_id, v.fecha, v.precio, v.tipo, v.metodo_pago
      from ventas v where ${PLAN_TIPOS} order by v.cliente_id, v.fecha desc
    )
    select c.id, c.patente, c.nombre,
           to_char(p.fecha at time zone 'America/Santiago','YYYY-MM-DD') as ultimo_pago,
           p.precio, p.tipo, coalesce(p.metodo_pago,'-') as metodo,
           to_char(c.vencimiento at time zone 'America/Santiago','YYYY-MM-DD') as venc_antes,
           to_char(((p.fecha - interval '1 day') + interval '1 month') at time zone 'America/Santiago','YYYY-MM-DD') as venc_despues,
           ((p.fecha - interval '1 day') + interval '1 month') as venc_nuevo_ts,
           c.vencimiento as venc_antes_ts
    from clientes c join pago p on p.cliente_id = c.id
    where c.vencimiento is not null
      and p.fecha > now() - interval '400 days'
      -- figura vencido hoy...
      and (c.vencimiento at time zone 'America/Santiago')::date < (now() at time zone 'America/Santiago')::date
      -- ...pero el mes que pagó todavía corre
      and (((p.fecha - interval '1 day') + interval '1 month') at time zone 'America/Santiago')::date
          >= (now() at time zone 'America/Santiago')::date
    order by c.patente`);

  console.log(`\n1) VENCIMIENTOS A CORREGIR: ${aCorregir.length}`);
  for (const f of aCorregir) {
    console.log(
      `   ${String(f.patente).padEnd(7)} ${String(f.nombre).slice(0, 28).padEnd(28)} pagó ${f.ultimo_pago} $${f.precio} ${String(f.metodo).padEnd(13)} ${f.venc_antes} -> ${f.venc_despues}`
    );
  }

  // --- 2. proximo_cobro desalineado ----------------------------------------
  const aAlinear = await sql`
    select s.id, s.patente, c.nombre,
           to_char(s.proximo_cobro at time zone 'America/Santiago','YYYY-MM-DD') as proximo_antes,
           to_char(c.vencimiento at time zone 'America/Santiago','YYYY-MM-DD') as vencimiento,
           s.proximo_cobro as proximo_antes_ts
    from suscripciones_oneclick s
    join clientes c on c.patente = s.patente
    where s.estado = 'activa' and c.vencimiento is not null
      and (s.proximo_cobro is null or s.proximo_cobro < c.vencimiento)
    order by s.patente`;

  console.log(`\n2) proximo_cobro A ALINEAR CON EL VENCIMIENTO: ${aAlinear.length}`);
  for (const f of aAlinear) {
    console.log(`   ${String(f.patente).padEnd(7)} ${String(f.nombre).slice(0, 28).padEnd(28)} ${f.proximo_antes ?? "(null)"} -> ${f.vencimiento}`);
  }

  // --- 3. Quiénes quedan para cobrar ---------------------------------------
  // Se calcula DESPUÉS de aplicar (1) y (2) en la misma corrida: es
  // exactamente el conjunto que el cron va a tomar cuando vuelva a correr.
  const respaldo = {
    generadoEn: new Date().toISOString(),
    aplicado: APLICAR,
    vencimientos: aCorregir.map((f) => ({
      id: f.id,
      patente: f.patente,
      nombre: f.nombre,
      vencimiento_antes: f.venc_antes_ts,
      vencimiento_despues: f.venc_nuevo_ts,
    })),
    proximosCobros: aAlinear.map((f) => ({ id: f.id, patente: f.patente, proximo_cobro_antes: f.proximo_antes_ts })),
  };
  const stamp = respaldo.generadoEn.slice(0, 10);
  fs.writeFileSync(`respaldo-vencimientos-${stamp}.json`, JSON.stringify(respaldo, null, 2), "utf8");
  fs.writeFileSync(
    `respaldo-vencimientos-${stamp}.csv`,
    csv(aCorregir.map((f) => ({ patente: f.patente, nombre: f.nombre, ultimo_pago: f.ultimo_pago, precio: f.precio, metodo: f.metodo, tipo: f.tipo, venc_antes: f.venc_antes, venc_despues: f.venc_despues }))),
    "utf8"
  );
  console.log(`\nRespaldo escrito en respaldo-vencimientos-${stamp}.json / .csv`);

  if (!APLICAR) {
    console.log("\n--- DRY RUN, no se escribió nada. Correr con --apply para aplicar. ---");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const f of aCorregir) {
      await tx`update clientes set vencimiento = ${f.venc_nuevo_ts as Date} where id = ${f.id as string}`;
    }
    // Se re-consulta el vencimiento acá adentro para que los que acaban de
    // corregirse en el loop de arriba queden alineados con el valor NUEVO.
    await tx`
      update suscripciones_oneclick s
      set proximo_cobro = c.vencimiento, actualizado_en = now()
      from clientes c
      where c.patente = s.patente and s.estado = 'activa' and c.vencimiento is not null
        and (s.proximo_cobro is null or s.proximo_cobro < c.vencimiento)`;
  });
  console.log("\nAplicado.");

  const paraCobrar = await sql`
    select s.patente, c.nombre, s.card_ultimos_digitos,
           to_char(c.vencimiento at time zone 'America/Santiago','YYYY-MM-DD') as vencimiento,
           to_char(s.proximo_cobro at time zone 'America/Santiago','YYYY-MM-DD') as proximo_cobro
    from suscripciones_oneclick s
    join clientes c on c.patente = s.patente
    where s.estado = 'activa' and s.tbk_user is not null and s.proximo_cobro <= now()
    order by s.proximo_cobro`;
  console.log(`\n3) QUEDA PARA COBRAR (lo que tomará el cron): ${paraCobrar.length}`);
  for (const f of paraCobrar) {
    console.log(`   ${String(f.patente).padEnd(7)} ${String(f.nombre).slice(0, 28).padEnd(28)} venció ${f.vencimiento}  tarjeta ${f.card_ultimos_digitos}`);
  }

  await sql.end();
}
main();
