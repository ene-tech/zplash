// Le devuelve el mes SIN TOPE al cliente que pago un mes de ilimitado y quedo
// capado a mitad de camino.
//
// Que les paso: al renovar, el webhook les escribe plan = "Plan X5" y les deja
// ilimitado_hasta al final del mes que YA tenian comprado (ver
// ilimitadoHastaAlRenovar). Pero varios renovaron ANTES de que se les venciera,
// asi que su vencimiento quedo un mes mas adelante que ese ilimitado_hasta: el
// tramo entre las dos fechas es tiempo que pagaron como ilimitado y estan
// usando como X5, con tope de 5.
//
// Arreglo: ilimitado_hasta = vencimiento. Terminan el mes que compraron sin
// tope y el corte ocurre cuando les toque renovar, con aviso previo — no de
// golpe a mitad de mes.
//
// Solo toca a quien NUNCA acepto el X5 (acepto_x5_en null): al que lo contrato
// no hay nada que devolverle.
//
// No toca `plan` ni el cobro automatico: siguen en Plan X5 y su Oneclick cobra
// igual. planVigente ya sabe leer ilimitado_hasta y darles el sin tope.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-ultimo-mes-ilimitado.mts [--aplicar]
import postgres from "postgres";

const APLICAR = process.argv.includes("--aplicar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const CRITERIO = sql`
  plan = 'Plan X5'
  and vencimiento > now()
  and acepto_x5_en is null
  and ilimitado_hasta is not null
  and ilimitado_hasta < vencimiento`;

try {
  const filas = await sql`
    select id, patente, nombre, email,
           to_char(ilimitado_hasta, 'YYYY-MM-DD') as ilim_actual,
           to_char(vencimiento, 'YYYY-MM-DD') as vence,
           (select count(*)::int from ingresos i
             where i.cliente_id = clientes.id
               and i.fecha >= date_trunc('month', now() - interval '1 month')
               and i.fecha <  date_trunc('month', now())) as lavados_mes_pasado
    from clientes where ${CRITERIO}
    order by lavados_mes_pasado desc, patente`;

  console.log(`${APLICAR ? "EJECUTANDO" : "SIMULACRO (sin --aplicar no se escribe nada)"}\n`);
  console.log(`Clientes a los que se les devuelve el mes sin tope: ${filas.length}\n`);
  for (const f of filas as any[]) {
    const dias = Math.round((Date.parse(f.vence) - Date.parse(f.ilim_actual)) / 86_400_000);
    console.log(
      `  ${f.patente.padEnd(7)} ${String(f.nombre).slice(0, 26).padEnd(26)} ` +
        `sin tope hasta ${f.ilim_actual} -> ${f.vence}  (+${dias} dias, ${f.lavados_mes_pasado} lavados el mes pasado)`
    );
  }

  if (!APLICAR) {
    console.log(`\n(dry-run: no se movio nada. Correr con --aplicar para aplicarlo.)`);
  } else {
    const r = await sql`update clientes set ilimitado_hasta = vencimiento where ${CRITERIO} returning patente`;
    console.log(`\nActualizados: ${r.length}`);
    const quedan = await sql`select count(*)::int n from clientes where ${CRITERIO}`;
    console.log(`Sin arreglar (deberia ser 0): ${(quedan as any[])[0].n}`);
  }
} finally {
  await sql.end();
}
