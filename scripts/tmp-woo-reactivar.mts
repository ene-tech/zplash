// Reactiva en WooCommerce las suscripciones de los clientes VIGENTES que usan
// 5 pasadas o menos al mes — la politica de rescate de ago-2026: al que usa
// poco se le mantiene su ilimitado viejo y se le sigue cobrando por Woo (ver
// planResultante en /api/webhooks/woocommerce y superoTopeIlimitado).
//
// Solo toca a los que estaban al dia: el vencido no se reactiva sin que lo
// pida (cobrarle un mes que no pidio es contracargo seguro).
//
// LO IMPORTANTE: al reactivar se le fija next_payment_date = el vencimiento
// que tiene en NUESTRA base. Sin eso, WooCommerce arrastra la fecha vencida
// que traia de cuando cayo en on-hold y le cobra el mes apenas se destrabe el
// staging lock — un mes que el cliente ya tiene pagado.
//
// Requisitos para que esto sirva de algo:
//   1. destrabar el staging lock en WP (WooCommerce > Subscriptions), si no
//      Woo no cobra nada igual;
//   2. WOOCOMMERCE_CONSUMER_KEY/SECRET con permiso de escritura.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-reactivar.mts [--aplicar]
import postgres from "postgres";
import { sumarMesesFecha } from "@/lib/helpers/fechas";

const APLICAR = process.argv.includes("--aplicar");
const TOPE = 5;
const CICLOS = 3;
const u = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");

async function woo(path: string) {
  const out: any[] = [];
  let p = 1, tp = 1;
  do {
    const r = await fetch(`${u}${path}&per_page=100&page=${p}`, { headers: { Authorization: auth } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    tp = Number(r.headers.get("x-wp-totalpages")) || 1;
    out.push(...(await r.json()));
    p++;
  } while (p <= tp);
  return out;
}

const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function patenteDe(o: any): string {
  const cands: string[] = [];
  for (const [k, v] of Object.entries(o.billing || {})) if (typeof v === "string" && /patente/i.test(k)) cands.push(v);
  for (const m of o.meta_data || []) if (typeof m?.key === "string" && /patente/i.test(m.key) && typeof m.value === "string") cands.push(m.value);
  return norm(cands.find((c) => c && c.trim()) || "");
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const { clientes, ingresos } = await sql.begin(async (tx) => {
  await tx.unsafe("set transaction read only");
  const clientes = await tx.unsafe(`
    with oc as (select distinct cliente_id from suscripciones_oneclick where estado in ('activa','pendiente'))
    select c.id, c.patente, lower(c.email) email, c.nombre, c.plan, c.fecha_contratacion, c.vencimiento
    from clientes c left join oc on oc.cliente_id = c.id
    where c.suscripcion_cancelada_en >= date '2026-08-31' and c.vencimiento >= now() and oc.cliente_id is null`);
  const ingresos = await tx.unsafe(`select cliente_id, fecha from ingresos where fecha > now() - interval '8 months'`);
  return { clientes, ingresos } as any;
});
await sql.end();

const porCliente = new Map<string, Date[]>();
for (const i of ingresos) {
  if (!i.cliente_id) continue;
  porCliente.set(i.cliente_id, [...(porCliente.get(i.cliente_id) || []), new Date(i.fecha)]);
}

const hoy = new Date();
hoy.setHours(0, 0, 0, 0);
// Promedio de pasadas en los ciclos mensuales CERRADOS (el en curso esta a
// medias y haria pasar por bajo uso a cualquiera).
const promedioPasadas = (c: any): number | null => {
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
  return ciclos.length ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : null;
};

const objetivo = clientes
  .map((c: any) => ({ ...c, promedio: promedioPasadas(c) }))
  .filter((c: any) => c.promedio !== null && c.promedio <= TOPE);

const canceladas = await woo("/wp-json/wc/v3/subscriptions?status=cancelled&");
const porPatente = new Map<string, any>();
for (const s of canceladas) {
  const k = patenteDe(s);
  // Si el cliente tiene mas de una cancelada, se reactiva la de fecha de
  // creacion mas reciente: las viejas son las duplicadas que ya limpiamos.
  const previa = porPatente.get(k);
  if (!previa || String(s.date_created) > String(previa.date_created)) porPatente.set(k, s);
}
const porEmail = new Map<string, any>();
for (const s of canceladas) {
  const e = String(s.billing?.email || "").trim().toLowerCase();
  if (e && !porEmail.has(e)) porEmail.set(e, s);
}

const plan = objetivo.map((c: any) => ({ cliente: c, sub: porPatente.get(norm(c.patente)) || porEmail.get(c.email) }));
const conSub = plan.filter((p: any) => p.sub);
const sinSub = plan.filter((p: any) => !p.sub);

console.log(`Vigentes con Woo cancelado hoy y sin Oneclick: ${clientes.length}`);
console.log(`  de esos, ${TOPE} pasadas o menos al mes:      ${objetivo.length}`);
console.log(`  con suscripcion cancelada que reactivar:      ${conSub.length}`);
console.log(`  sin suscripcion encontrada en Woo:            ${sinSub.length}`);
console.log("");
for (const { cliente, sub } of conSub) {
  const proximo = new Date(cliente.vencimiento).toISOString().slice(0, 19).replace("T", " ");
  console.log(`  #${sub.id} ${cliente.patente} ${String(cliente.nombre).slice(0, 26).padEnd(26)} ${cliente.promedio.toFixed(1)} pasadas/mes | next_payment -> ${proximo} (era ${String(sub.next_payment_date_gmt || "-").slice(0, 10)})`);
}
for (const { cliente } of sinSub) console.log(`  SIN SUB  ${cliente.patente} ${cliente.nombre}`);

if (!APLICAR) {
  console.log("\n(dry-run: no se reactivo nada. Correr con --aplicar para ejecutar.)");
  process.exit(0);
}

let ok = 0;
const errores: string[] = [];
for (const { cliente, sub } of conSub) {
  // next_payment_date_gmt en el mismo PUT que el status: si se manda despues,
  // WooCommerce ya recalculo la fecha al reactivar.
  const body = {
    status: "active",
    next_payment_date_gmt: new Date(cliente.vencimiento).toISOString().slice(0, 19),
  };
  const r = await fetch(`${u}/wp-json/wc/v3/subscriptions/${sub.id}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    errores.push(`#${sub.id} ${cliente.patente} ${r.status} ${(await r.text()).slice(0, 140)}`);
    continue;
  }
  const s = await r.json();
  if (s.status !== "active") errores.push(`#${sub.id} ${cliente.patente} quedo en "${s.status}"`);
  else ok++;
  if ((ok + errores.length) % 20 === 0) console.log(`  ${ok + errores.length}/${conSub.length}...`);
}
console.log(`\nReactivadas: ${ok}/${conSub.length}`);
for (const e of errores) console.log("  ERROR " + e);
