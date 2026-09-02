// Da de baja en WooCommerce las suscripciones que NO corresponde cobrar cuando
// se destrabe el staging site lock, y cancela sus pedidos de renovacion
// pendientes para que no queden cobrables.
//
// La clasificacion se recalcula en el momento (./wooLimpieza.mts): este script
// nunca actua sobre una lista generada antes. Ver diag-woo-limpieza.mts para
// que significa cada veredicto.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-bajar-limpieza.mts
//        -> simulacro, no escribe nada
//      npx tsx --env-file=.env.local scripts/tmp-woo-bajar-limpieza.mts --ejecutar
//        -> aplica las bajas
//
// Deja el detalle de cada llamada en scripts/sql/woo-bajas-<fecha>.json.
import { writeFileSync } from "node:fs";
import { VEREDICTOS_A_CANCELAR, clasificar } from "./wooLimpieza";

const ejecutar = process.argv.includes("--ejecutar");
// Tope de seguridad: si la clasificacion se rompe y de golpe "hay que cancelar
// todo", esto lo frena antes de tocar la primera suscripcion. El numero
// esperado ronda las 130 de 241 vivas; 160 deja holgura sin permitir un barrido.
const MAX_BAJAS = 160;

const site = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");
const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function woo(path: string, init?: RequestInit) {
  const r = await fetch(`${site}${path}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}
async function wooTodo(path: string) {
  const out: any[] = [];
  let p = 1, tp = 1;
  do {
    const r = await fetch(`${site}${path}&per_page=100&page=${p}`, { headers: { Authorization: auth } });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    tp = Number(r.headers.get("x-wp-totalpages")) || 1;
    out.push(...(await r.json()));
    p++;
  } while (p <= tp);
  return out;
}
function patenteDePedido(o: any): string {
  const c: string[] = [];
  for (const [k, v] of Object.entries(o.billing || {})) if (typeof v === "string" && /patente/i.test(k)) c.push(v);
  for (const m of o.meta_data || []) if (typeof m?.key === "string" && /patente/i.test(m.key) && typeof m.value === "string") c.push(m.value);
  for (const li of o.line_items || []) for (const m of li.meta_data || []) if (/patente/i.test(String(m?.key)) && typeof m?.value === "string") c.push(m.value);
  return norm(c.find((x) => x && x.trim()) || "");
}

const filas = await clasificar();
const aBajar = filas.filter((f) => VEREDICTOS_A_CANCELAR.includes(f.v));
const seMantienen = filas.filter((f) => !VEREDICTOS_A_CANCELAR.includes(f.v));
const plata = (fs: typeof filas) => "$" + fs.reduce((a, f) => a + f.s.monto, 0).toLocaleString("es-CL");

console.log(`${ejecutar ? "EJECUTANDO" : "SIMULACRO (sin --ejecutar no se escribe nada)"}\n`);
console.log(`Suscripciones vivas: ${filas.length}`);
console.log(`  a dar de baja:     ${aBajar.length}  ${plata(aBajar)}/mes`);
for (const v of VEREDICTOS_A_CANCELAR) {
  const g = aBajar.filter((f) => f.v === v);
  if (g.length) console.log(`     ${v.padEnd(13)} ${String(g.length).padStart(3)}  ${plata(g)}/mes`);
}
console.log(`  se mantienen:      ${seMantienen.length}  ${plata(seMantienen)}/mes`);

if (aBajar.length > MAX_BAJAS) {
  console.error(`\nABORTA: ${aBajar.length} bajas supera el tope de seguridad (${MAX_BAJAS}). Revisar la clasificacion antes de insistir.`);
  process.exit(1);
}

// Los pedidos de renovacion pendientes de esas mismas patentes: al cancelar la
// suscripcion el pedido queda huerfano pero cobrable, asi que se cancela tambien.
const patentesBajadas = new Set(aBajar.map((f) => f.s.patente || norm(f.c?.patente || "")).filter(Boolean));
const pendientes = (await wooTodo(`/wp-json/wc/v3/orders?status=pending&after=2026-08-01T00:00:00&`))
  .filter((o) => o.created_via === "subscription" && patentesBajadas.has(patenteDePedido(o)));
console.log(`  pedidos pendientes de esas patentes: ${pendientes.length}  $${pendientes.reduce((a, o) => a + Number(o.total), 0).toLocaleString("es-CL")}`);

if (!ejecutar) {
  console.log(`\nPara aplicarlo: agregar --ejecutar`);
  process.exit(0);
}

const informe: any[] = [];
let ok = 0, yaEstaba = 0, fallo = 0;

for (const [i, f] of aBajar.entries()) {
  const etiqueta = `#${f.s.id} ${f.s.patente || f.c?.patente || "?"} ${String(f.c?.nombre || f.s.email).slice(0, 24)}`;
  try {
    const actual = await woo(`/wp-json/wc/v3/subscriptions/${f.s.id}`);
    if (actual.status === "cancelled") {
      yaEstaba++;
      informe.push({ tipo: "suscripcion", id: f.s.id, veredicto: f.v, resultado: "ya estaba cancelada" });
      console.log(`  [${i + 1}/${aBajar.length}] ${etiqueta} — ya estaba cancelada`);
      continue;
    }
    const res = await woo(`/wp-json/wc/v3/subscriptions/${f.s.id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    if (res.status !== "cancelled") throw new Error(`quedo en "${res.status}"`);
    ok++;
    informe.push({ tipo: "suscripcion", id: f.s.id, veredicto: f.v, motivo: f.motivo, patente: f.s.patente, nombre: f.c?.nombre, monto: f.s.monto, resultado: "cancelada" });
    console.log(`  [${i + 1}/${aBajar.length}] ${etiqueta} — cancelada (${f.v})`);
  } catch (e) {
    fallo++;
    informe.push({ tipo: "suscripcion", id: f.s.id, veredicto: f.v, resultado: "ERROR", error: String(e) });
    console.error(`  [${i + 1}/${aBajar.length}] ${etiqueta} — ERROR: ${e}`);
  }
}

for (const [i, o] of pendientes.entries()) {
  try {
    const res = await woo(`/wp-json/wc/v3/orders/${o.id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    if (res.status !== "cancelled") throw new Error(`quedo en "${res.status}"`);
    informe.push({ tipo: "pedido", id: o.id, patente: patenteDePedido(o), monto: Number(o.total), resultado: "cancelado" });
    console.log(`  pedido [${i + 1}/${pendientes.length}] #${o.id} ${patenteDePedido(o)} $${o.total} — cancelado`);
  } catch (e) {
    fallo++;
    informe.push({ tipo: "pedido", id: o.id, resultado: "ERROR", error: String(e) });
    console.error(`  pedido [${i + 1}/${pendientes.length}] #${o.id} — ERROR: ${e}`);
  }
}

const ruta = `scripts/sql/woo-bajas-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
writeFileSync(ruta, JSON.stringify(informe, null, 2), "utf8");
console.log(`\nSuscripciones canceladas: ${ok} | ya estaban: ${yaEstaba} | errores: ${fallo}`);
console.log(`Pedidos cancelados: ${informe.filter((r) => r.tipo === "pedido" && r.resultado === "cancelado").length}`);
console.log(`Detalle: ${ruta}`);
