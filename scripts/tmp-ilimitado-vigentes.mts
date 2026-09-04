// SOLO LECTURA: foto de los clientes con el Plan Ilimitado legacy VIGENTE hoy y
// como quedan al terminar su ciclo segun la politica del 31-ago-2026
// (<=PASES_INCLUIDOS_X5 pasadas => se le mantiene; se paso => pasa al X5).
// Mismo criterio que scripts/diag-fin-ilimitado-publico.mts, pero sobre todos
// los vigentes y no solo los que vencen dentro de N dias.
import postgres from "postgres";
import { periodoPlan } from "@/lib/helpers/clientes";
import { sigueVigenteHoy } from "@/lib/helpers/clientes";
import { PASES_INCLUIDOS_X5, PLAN_ILIMITADO_LEGACY, planVigente } from "@/lib/helpers/precios";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const { cl, ing } = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return {
      cl: await tx.unsafe(`
        select id, patente, plan, ilimitado_hasta, acepto_x5_en, fecha_contratacion, vencimiento,
               renovacion_auto_woo_desde
        from clientes where plan is not null and vencimiento is not null`),
      ing: await tx.unsafe(`select cliente_id, fecha from ingresos where fecha > now() - interval '5 months'`),
    } as any;
  });

  const pasadasDe = new Map<string, Date[]>();
  for (const i of ing as any[]) if (i.cliente_id) pasadasDe.set(i.cliente_id, [...(pasadasDe.get(i.cliente_id) || []), new Date(i.fecha)]);
  const cuenta = (id: string, a: Date, b: Date) => (pasadasDe.get(id) || []).filter((f) => f >= a && f < b).length;

  const todos = cl as any[];
  const filas = todos
    .map((c) => {
      const vig = planVigente({ plan: c.plan ?? undefined, ilimitadoHasta: c.ilimitado_hasta ?? undefined });
      const { inicio, fin } = periodoPlan({ fechaContratacion: c.fecha_contratacion, vencimiento: c.vencimiento } as any);
      const antes = new Date(inicio); antes.setDate(antes.getDate() - 1);
      const prev = periodoPlan({ fechaContratacion: c.fecha_contratacion, vencimiento: c.vencimiento } as any, antes);
      const diasRestantes = Math.round((fin.getTime() - Date.now()) / 86400000);
      return { c, vig, pasadas: cuenta(c.id, inicio, fin), pasadasPrev: cuenta(c.id, prev.inicio, prev.fin), diasRestantes,
               tuvoPrev: (pasadasDe.get(c.id) || []).some((f) => f < inicio) };
    })
    .filter((f) => f.vig === PLAN_ILIMITADO_LEGACY && sigueVigenteHoy(f.c.vencimiento));

  const paso = filas.filter((f) => f.pasadas > PASES_INCLUIDOS_X5);
  const mant = filas.filter((f) => f.pasadas <= PASES_INCLUIDOS_X5);
  const conArrastre = filas.filter((f) => f.c.plan !== PLAN_ILIMITADO_LEGACY);

  console.log(`ILIMITADO VIGENTE HOY (planVigente = "${PLAN_ILIMITADO_LEGACY}" y vencimiento >= hoy Chile): ${filas.length}`);
  console.log(`  de esos, ya con el X5 pagado y solo arrastrando el mes sin tope: ${conArrastre.length}`);
  console.log(`  aun sin migrar (plan = ilimitado): ${filas.length - conArrastre.length}`);
  console.log(`\nCon el ciclo EN CURSO (foto de hoy, ciclo incompleto):`);
  console.log(`  PASAN AL X5   (> ${PASES_INCLUIDOS_X5} pasadas): ${paso.length}`);
  console.log(`  MANTIENEN     (<= ${PASES_INCLUIDOS_X5}):        ${mant.length}`);
  console.log(`\nCiclo ANTERIOR completo (proyeccion mas honesta):`);
  const conPrev = filas.filter((f) => f.tuvoPrev);
  console.log(`  con historial de ciclo anterior: ${conPrev.length}`);
  console.log(`  de esos, se pasaron del tope:    ${conPrev.filter((f) => f.pasadasPrev > PASES_INCLUIDOS_X5).length}`);
  console.log(`\nRiesgo de cambiar de bucket antes de vencer (estan en MANTIENEN pero les queda ciclo):`);
  for (const n of [5, 4, 3]) {
    const g = mant.filter((f) => f.pasadas === n);
    console.log(`  con ${n} pasadas: ${g.length}  (dias que les quedan del ciclo: ${g.map((f) => f.diasRestantes).sort((a, b) => a - b).join(",") || "-"})`);
  }
  const dist: Record<number, number> = {};
  for (const f of filas) dist[f.pasadas] = (dist[f.pasadas] || 0) + 1;
  console.log(`\nDistribucion de pasadas del ciclo en curso:`, Object.entries(dist).map(([k, v]) => `${k}:${v}`).join("  "));
  console.log(`\nCanal de renovacion de los que PASAN AL X5: Woo ${paso.filter((f) => f.c.renovacion_auto_woo_desde).length} / resto ${paso.filter((f) => !f.c.renovacion_auto_woo_desde).length}`);
  const woo = (g:any[]) => g.filter((f) => f.c.renovacion_auto_woo_desde).length;
  console.log(`
Canal de renovacion (unico camino que CONSERVA el ilimitado = webhook de Woo):`);
  console.log(`  MANTIENEN (<=5) con renovacion auto Woo: ${woo(mant)}  |  sin Woo: ${mant.length - woo(mant)}`);
  console.log(`  PASAN (>5)      con renovacion auto Woo: ${woo(paso)}  |  sin Woo: ${paso.length - woo(paso)}`);
  const yaX5Woo = conArrastre.filter((f) => f.c.renovacion_auto_woo_desde);
  console.log(`
  De los 'MANTIENEN con Woo', ya tienen plan=X5 (arrastre) y NO conservan nada: ${yaX5Woo.filter((f) => f.pasadas <= PASES_INCLUIDOS_X5).length}`);
  const conservan = mant.filter((f) => f.c.renovacion_auto_woo_desde && f.c.plan === PLAN_ILIMITADO_LEGACY);
  console.log(`
== CONSERVAN DE VERDAD (Woo + <=5 + todavia plan ilimitado): ${conservan.length}`);
  console.log(`   de esos, se pasaron del tope en su ciclo ANTERIOR completo: ${conservan.filter((f) => f.pasadasPrev > PASES_INCLUIDOS_X5).length}`);
  console.log(`   de esos, hoy van en 4 o 5 pasadas con ciclo por delante:    ${conservan.filter((f) => f.pasadas >= 4 && f.diasRestantes > 2).length}`);
} finally { await sql.end(); }
