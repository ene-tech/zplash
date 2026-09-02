// SOLO LECTURA: uso real de los clientes VIGENTES web sin cobro automatico
// (el segmento de la invitacion a Oneclick). Cuenta pasadas por ciclo mensual
// del plan, anclado a fechaContratacion igual que periodoPlan.
//
// El ciclo EN CURSO se excluye a proposito: esta a medias, y contarlo haria
// que todos parezcan de bajo uso.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-pasadas-vigentes.mts
import postgres from "postgres";
import { sumarMesesFecha } from "@/lib/helpers/fechas";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const { clientes, ingresos } = await sql.begin(async (tx) => {
  await tx.unsafe("set transaction read only");
  const clientes = await tx.unsafe(`
    with oc as (select distinct cliente_id from suscripciones_oneclick where estado in ('activa','pendiente'))
    select c.id, c.patente, c.nombre, c.plan, c.fecha_contratacion, c.vencimiento
    from clientes c left join oc on oc.cliente_id = c.id
    where coalesce(c.origen,'LOCAL') = 'WEB' and oc.cliente_id is null and c.vencimiento >= now()`);
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
const CICLOS = 3;

// Mismo anclaje que periodoPlan/anclaCicloPlan: fechaContratacion, y si no hay,
// el vencimiento (que siempre cae en un borde de ciclo).
function ciclosCerrados(c: any): { inicio: Date; fin: Date }[] {
  const base = new Date(c.fecha_contratacion || c.vencimiento);
  let n = 0;
  while (sumarMesesFecha(base, n + 1) <= hoy) n++;
  while (sumarMesesFecha(base, n) > hoy) n--;
  // n = ciclo en curso. Los cerrados son n-1, n-2, n-3...
  const out = [];
  for (let k = 1; k <= CICLOS; k++) {
    const inicio = sumarMesesFecha(base, n - k);
    const fin = sumarMesesFecha(base, n - k + 1);
    if (fin <= new Date(c.fecha_contratacion || c.vencimiento)) break;
    out.push({ inicio, fin });
  }
  return out;
}

const filas = clientes.map((c: any) => {
  const visitas = porCliente.get(c.id) || [];
  const ciclos = ciclosCerrados(c).map((p) => visitas.filter((f) => f >= p.inicio && f < p.fin).length);
  const conDatos = ciclos.length;
  const promedio = conDatos ? ciclos.reduce((a, b) => a + b, 0) / conDatos : 0;
  return { ...c, ciclos, ultimo: ciclos[0] ?? 0, promedio, conDatos };
});

// Los recien contratados (sin ningun ciclo cerrado) salen del analisis: un
// promedio 0 ahi es falta de historial, no falta de uso.
const conHistorial = filas.filter((f: any) => f.conDatos > 0);
const n = (f: (x: any) => boolean) => conHistorial.filter(f).length;
const pct = (x: number) => `${((x / conHistorial.length) * 100).toFixed(0)}%`;

console.log(`Vigentes WEB sin cobro automatico: ${filas.length}`);
console.log(`  con al menos un ciclo mensual cerrado: ${conHistorial.length} (los otros ${filas.length - conHistorial.length} contrataron hace menos de un mes)`);
console.log(`Ciclos mensuales cerrados mirados por cliente: hasta ${CICLOS} (el ciclo en curso NO se cuenta)\n`);

console.log(`Por PROMEDIO de pasadas al mes:`);
for (const [label, test] of [
  ["0 (no viene nunca)", (f: any) => f.promedio === 0],
  ["0.1 - 1", (f: any) => f.promedio > 0 && f.promedio <= 1],
  ["1.1 - 2", (f: any) => f.promedio > 1 && f.promedio <= 2],
  ["2.1 - 3", (f: any) => f.promedio > 2 && f.promedio <= 3],
  ["3.1 - 4", (f: any) => f.promedio > 3 && f.promedio <= 4],
  ["4.1 - 5", (f: any) => f.promedio > 4 && f.promedio <= 5],
  ["mas de 5", (f: any) => f.promedio > 5],
] as any) {
  console.log(`  ${String(label).padEnd(20)} ${String(n(test)).padStart(4)}  ${pct(n(test))}`);
}

console.log(`\n5 o menos al mes (promedio):        ${n((f) => f.promedio <= 5)}  ${pct(n((f) => f.promedio <= 5))}`);
console.log(`5 o menos en el ultimo ciclo cerrado: ${n((f) => f.ultimo <= 5)}  ${pct(n((f) => f.ultimo <= 5))}`);
console.log(`Nunca pasaron en ningun ciclo cerrado: ${n((f) => f.promedio === 0)}`);
console.log(`Sin ningun ciclo cerrado (recien contrataron): ${n((f) => f.conDatos === 0)}`);
