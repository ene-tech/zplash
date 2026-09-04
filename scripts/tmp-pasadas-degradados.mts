// SOLO LECTURA: pasadas del ciclo EN CURSO de los clientes del ilimitado legacy
// que quedaron en X5 al renovar por Webpay entre el 19 y el 27-ago-2026 (ver
// aplicarPagoAprobado, que escribe PLANES[0] sin mirar requiereValidacionX5).
// Sirve para decidir a quien se le devuelve el mes sin tope: el que ya va en
// mas de PASES_INCLUIDOS_X5 se lleva pasadas gratis, el que va en menos no.
import postgres from "postgres";
import { periodoPlan } from "@/lib/helpers/clientes";
import { PASES_INCLUIDOS_X5, PLAN_ILIMITADO_LEGACY } from "@/lib/helpers/precios";

const PATENTES = ["DGPP55","DVKX90","DYDJ71","GXHG66","HYPZ38","KRBZ65","KXWK73","PPFS16",
                  "PZVD12","RLVY77","RSLP30","SBZS41","SSFF18","VPGR64","VPGS30","VRHT17",
                  "RVFH63","SJTV87"];

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const { cl, ing } = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    const cl = await tx`select id, patente, nombre, plan, ilimitado_hasta, fecha_contratacion, vencimiento
                        from clientes where patente in ${tx(PATENTES)}`;
    const ids = cl.map((c: any) => c.id);
    const ing = await tx`select cliente_id, fecha from ingresos
                         where cliente_id in ${tx(ids)} and fecha > now() - interval '4 months'`;
    return { cl, ing };
  });

  const pasadasDe = new Map<string, Date[]>();
  for (const i of ing as any[]) pasadasDe.set(i.cliente_id, [...(pasadasDe.get(i.cliente_id) || []), new Date(i.fecha)]);
  const cuenta = (id: string, a: Date, b: Date) => (pasadasDe.get(id) || []).filter((f) => f >= a && f < b).length;

  const filas = (cl as any[]).map((c) => {
    const cli = { fechaContratacion: c.fecha_contratacion, vencimiento: c.vencimiento } as any;
    const { inicio, fin } = periodoPlan(cli);
    const antes = new Date(inicio); antes.setDate(antes.getDate() - 1);
    const prev = periodoPlan(cli, antes);
    const pasadas = cuenta(c.id, inicio, fin);
    return {
      patente: c.patente,
      pasadas,
      tope: pasadas > PASES_INCLUIDOS_X5 ? `SE PASO (+${pasadas - PASES_INCLUIDOS_X5})` : `le quedan ${PASES_INCLUIDOS_X5 - pasadas}`,
      ciclo: `${inicio.toLocaleDateString("es-CL")} - ${new Date(fin.getTime() - 86400000).toLocaleDateString("es-CL")}`,
      dias_restantes: Math.round((fin.getTime() - Date.now()) / 86400000),
      ciclo_anterior: cuenta(c.id, prev.inicio, prev.fin),
      plan: c.plan === PLAN_ILIMITADO_LEGACY ? "ilimitado (ya devuelto)" : c.plan,
    };
  }).sort((a, b) => b.pasadas - a.pasadas);

  console.table(filas);
  const aDevolver = filas.filter((f) => f.plan === "Plan X5");
  console.log(`\nDe los ${aDevolver.length} que siguen en X5:`);
  console.log(`  ya se pasaron de ${PASES_INCLUIDOS_X5}: ${aDevolver.filter((f) => f.pasadas > PASES_INCLUIDOS_X5).length}`);
  console.log(`  van en ${PASES_INCLUIDOS_X5} justo:      ${aDevolver.filter((f) => f.pasadas === PASES_INCLUIDOS_X5).length}`);
  console.log(`  van bajo el tope:      ${aDevolver.filter((f) => f.pasadas < PASES_INCLUIDOS_X5).length}`);
  console.log(`  pasadas extra regaladas si se les devuelve hoy: ${aDevolver.reduce((s, f) => s + Math.max(0, f.pasadas - PASES_INCLUIDOS_X5), 0)}`);
} finally { await sql.end(); }
