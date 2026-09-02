// SOLO LECTURA: a quien le tocaria el aviso del fin del Plan Ilimitado.
//
// Politica (31-ago-2026): al del ilimitado viejo que usa PASES_INCLUIDOS_X5
// pasadas o menos se le MANTIENE el plan y se le sigue cobrando; al que se pasa
// se le termina y se le ofrece el X5. El aviso es solo para los segundos, en la
// etapa final de su plan.
//
// Cuenta las pasadas del ciclo EN CURSO con periodoPlan (anclado a
// fechaContratacion), el mismo contador que mira superoTopeIlimitado, y mira
// planVigente y no `plan` a secas: al que renovo, la ficha le dice "Plan X5"
// aunque siga usando el mes sin tope que ya pago.
//
// Uso: npx tsx --env-file=.env.local scripts/diag-fin-ilimitado-publico.mts [dias]
import postgres from "postgres";
import { periodoPlan } from "@/lib/helpers/clientes";
import { PASES_INCLUIDOS_X5, PLAN_ILIMITADO_LEGACY, planVigente } from "@/lib/helpers/precios";

const DIAS = Number(process.argv[2]) || 7;
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

try {
  const { cl, ing } = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return {
      cl: await tx.unsafe(`
        select c.id, c.patente, c.nombre, c.email, c.plan, c.ilimitado_hasta, c.fecha_contratacion,
               c.vencimiento, c.renovacion_auto_woo_desde,
               exists(select 1 from suscripciones_oneclick s where s.patente = c.patente and s.estado = 'activa') as oneclick
        from clientes c
        where c.vencimiento >= now() and c.vencimiento <= now() + interval '${DIAS} days'`),
      ing: await tx.unsafe(`select cliente_id, fecha from ingresos where fecha > now() - interval '4 months'`),
    } as any;
  });

  const pasadasDe = new Map<string, Date[]>();
  for (const i of ing as any[]) if (i.cliente_id) pasadasDe.set(i.cliente_id, [...(pasadasDe.get(i.cliente_id) || []), new Date(i.fecha)]);

  const filas = (cl as any[])
    .map((c) => {
      const vigente = planVigente({ plan: c.plan ?? undefined, ilimitadoHasta: c.ilimitado_hasta ?? undefined });
      const { inicio, fin } = periodoPlan({ fechaContratacion: c.fecha_contratacion, vencimiento: c.vencimiento } as any);
      const pasadas = (pasadasDe.get(c.id) || []).filter((f) => f >= inicio && f < fin).length;
      return { c, vigente, pasadas, cicloDesde: inicio.toISOString().slice(0, 10) };
    })
    .filter((f) => f.vigente === PLAN_ILIMITADO_LEGACY);

  const cortar = filas.filter((f) => f.pasadas > PASES_INCLUIDOS_X5).sort((a, b) => b.pasadas - a.pasadas);
  const mantener = filas.filter((f) => f.pasadas <= PASES_INCLUIDOS_X5);

  console.log(`Clientes con el ilimitado VIGENTE que vencen dentro de ${DIAS} dias: ${filas.length}\n`);
  console.log(`  MANTENER (<=${PASES_INCLUIDOS_X5} pasadas), no reciben nada:  ${mantener.length}`);
  console.log(`  AVISAR   (>=${PASES_INCLUIDOS_X5 + 1} pasadas), les termina:      ${cortar.length}\n`);
  if (cortar.length) {
    console.log(`== A QUIEN LE LLEGA EL AVISO ==`);
    for (const f of cortar)
      console.log(
        `  ${f.c.patente.padEnd(7)} ${String(f.c.nombre).slice(0, 26).padEnd(26)} ${String(f.pasadas).padStart(2)} pasadas desde ${f.cicloDesde}` +
          ` | vence ${new Date(f.c.vencimiento).toISOString().slice(0, 10)}` +
          ` | ${f.c.renovacion_auto_woo_desde ? "renueva Woo" : f.c.oneclick ? "Oneclick propio" : "sin renovacion"}` +
          `${f.c.email ? "" : "  <-- SIN EMAIL"}`
      );
  }
} finally {
  await sql.end();
}
