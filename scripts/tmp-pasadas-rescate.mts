// SOLO LECTURA: uso real (pasadas por ciclo mensual de plan) de los clientes a
// los que hoy 31-ago-2026 les cancelamos la suscripcion de WooCommerce, para
// decidir a quien se reactiva con el ilimitado legacy.
//
// Ciclo anclado a fechaContratacion igual que periodoPlan. El ciclo EN CURSO
// no se cuenta (esta a medias) y los que no tienen ningun ciclo cerrado quedan
// fuera del promedio (falta de historial, no falta de uso).
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-pasadas-rescate.mts
import postgres from "postgres";
import { sumarMesesFecha } from "@/lib/helpers/fechas";

const CICLOS = 3;
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const { clientes, ingresos } = await sql.begin(async (tx) => {
  await tx.unsafe("set transaction read only");
  const clientes = await tx.unsafe(`
    with oc as (select distinct cliente_id from suscripciones_oneclick where estado in ('activa','pendiente'))
    select c.id, c.patente, c.nombre, c.email, c.plan, c.ilimitado_hasta, c.precio_plan_heredado,
           c.fecha_contratacion, c.vencimiento, (c.vencimiento < now()) vencido,
           (oc.cliente_id is not null) tiene_oneclick
    from clientes c left join oc on oc.cliente_id = c.id
    where c.suscripcion_cancelada_en >= date '2026-08-31'`);
  const ingresos = await tx.unsafe(`select cliente_id, fecha from ingresos where fecha > now() - interval '8 months'`);
  return { clientes, ingresos } as any;
});
await sql.end();

const porCliente = new Map<string, Date[]>();
for (const i of ingresos) {
  if (!i.cliente_id) continue;
  const a = porCliente.get(i.cliente_id) || [];
  a.push(new Date(i.fecha));
  porCliente.set(i.cliente_id, a);
}

const hoy = new Date();
hoy.setHours(0, 0, 0, 0);

const filas = clientes.map((c: any) => {
  const ancla = new Date(c.fecha_contratacion || c.vencimiento);
  let n = 0;
  while (sumarMesesFecha(ancla, n + 1) <= hoy) n++;
  while (sumarMesesFecha(ancla, n) > hoy) n--;
  const visitas = porCliente.get(c.id) || [];
  const ciclos: number[] = [];
  for (let k = 1; k <= CICLOS; k++) {
    const inicio = sumarMesesFecha(ancla, n - k);
    const fin = sumarMesesFecha(ancla, n - k + 1);
    if (fin <= ancla) break;
    ciclos.push(visitas.filter((f) => f >= inicio && f < fin).length);
  }
  const promedio = ciclos.length ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : null;
  return { ...c, ciclos, promedio, max: ciclos.length ? Math.max(...ciclos) : null };
});

const conHistorial = filas.filter((f: any) => f.promedio !== null);
const bajo = conHistorial.filter((f: any) => f.promedio <= 5);
const alto = conHistorial.filter((f: any) => f.promedio > 5);
const nuevos = filas.filter((f: any) => f.promedio === null);
const seg = (fs: any[]) => `${fs.filter((f) => !f.vencido).length} vigentes / ${fs.filter((f) => f.vencido).length} vencidos`;

console.log(`Clientes con suscripcion Woo cancelada hoy: ${filas.length}   (${seg(filas)})`);
console.log(`  sin ningun ciclo cerrado (fuera del analisis): ${nuevos.length}`);
console.log(`  con historial: ${conHistorial.length}`);
console.log(`     promedio 5 o menos:  ${bajo.length}   (${seg(bajo)})`);
console.log(`     promedio mas de 5:   ${alto.length}   (${seg(alto)})`);
console.log(`\nDe los "5 o menos": nunca pasaron ${bajo.filter((f: any) => f.promedio === 0).length}, con email ${bajo.filter((f: any) => f.email).length}, ya en plan ilimitado legacy ${bajo.filter((f: any) => f.ilimitado_hasta).length}`);
console.log(`Pico historico dentro de los "5 o menos" (algun ciclo con 6+): ${bajo.filter((f: any) => (f.max ?? 0) >= 6).length}`);

const tramos: Record<string, number> = { "0": 0, "0.1-1": 0, "1.1-2": 0, "2.1-3": 0, "3.1-4": 0, "4.1-5": 0, "5.1-8": 0, "8.1+": 0 };
for (const f of conHistorial) {
  const p = f.promedio;
  tramos[p === 0 ? "0" : p <= 1 ? "0.1-1" : p <= 2 ? "1.1-2" : p <= 3 ? "2.1-3" : p <= 4 ? "3.1-4" : p <= 5 ? "4.1-5" : p <= 8 ? "5.1-8" : "8.1+"]++;
}
console.log(`\nPromedio de pasadas al mes:`);
for (const [k, v] of Object.entries(tramos)) console.log(`  ${k.padEnd(8)} ${String(v).padStart(4)}`);
