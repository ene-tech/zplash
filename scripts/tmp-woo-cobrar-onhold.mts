// Dispara el cobro de las suscripciones que quedaron "on-hold" con su pago
// atrasado, despues de soltar el staging site lock.
//
// Por que no se cobran solas: la cita de cobro (woocommerce_scheduled_
// subscription_payment) YA se disparo durante el lock y se consumio sin cobrar.
// Al destrabar no vuelve a agendarse sola: la suscripcion queda on-hold con un
// pedido de renovacion "pending" colgando y next_payment vacio.
//
// Lo que NO sirve:
//   - Ponerla en "active" a secas: no cobra nada, le da el mes gratis y
//     WooCommerce recalcula el proximo cobro un mes adelante.
//   - Marcar el pedido pendiente como "processing" por API: lo da por pagado
//     sin pasar por la pasarela. Mismo regalo, y ademas queda como venta.
//
// Lo que se hace aca, por suscripcion:
//   1. cancela el pedido "pending" viejo (si no, queda un cobro fantasma)
//   2. pone la suscripcion en "active"
//   3. le agenda next_payment a MINUTOS_ADELANTE minutos
// Action Scheduler toma esa cita, crea el pedido de renovacion y lo cobra
// contra el token de Oneclick guardado. De ahi sigue el camino normal: webhook
// -> venta -> correo de confirmacion.
//
// Solo toca suscripciones que la clasificacion de ./wooLimpieza da por
// MANTENER: se recalcula en el momento, no lee ninguna lista vieja.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-cobrar-onhold.mts [--aplicar] [--solo=ID]
import { clasificar } from "./wooLimpieza";

const APLICAR = process.argv.includes("--aplicar");
const SOLO = Number(process.argv.find((a) => a.startsWith("--solo="))?.split("=")[1] || 0);
const MINUTOS_ADELANTE = 2;

const u = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");
const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${u}/wp-json/wc/v3/${path}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 220)}`);
  return t ? JSON.parse(t) : null;
}
async function todos(path: string) {
  const o: any[] = [];
  let p = 1, tp = 1;
  do {
    const r = await fetch(`${u}${path}&per_page=100&page=${p}`, { headers: { Authorization: auth } });
    if (!r.ok) throw new Error(`${r.status}`);
    tp = Number(r.headers.get("x-wp-totalpages")) || 1;
    o.push(...(await r.json()));
    p++;
  } while (p <= tp);
  return o;
}
function patenteDe(o: any): string {
  const c: string[] = [];
  for (const [k, v] of Object.entries(o.billing || {})) if (typeof v === "string" && /patente/i.test(k)) c.push(v);
  for (const m of o.meta_data || []) if (typeof m?.key === "string" && /patente/i.test(m.key) && typeof m.value === "string") c.push(m.value);
  for (const li of o.line_items || []) for (const m of li.meta_data || []) if (/patente/i.test(String(m?.key)) && typeof m?.value === "string") c.push(m.value);
  return norm(c.find((x) => x && x.trim()) || "");
}

const filas = await clasificar();
const aCobrar = filas.filter((f) => f.v === "MANTENER" && f.s.estado === "on-hold" && (!SOLO || f.s.id === SOLO));
const bloqueadas = filas.filter((f) => f.v !== "MANTENER" && f.s.estado === "on-hold");

const pendientes = (await todos(`/wp-json/wc/v3/orders?status=pending&after=2026-08-01T00:00:00&`)).filter((o) => o.created_via === "subscription");
const pedidoDe = new Map<string, any>();
for (const o of pendientes) pedidoDe.set(patenteDe(o), o);

console.log(`${APLICAR ? "EJECUTANDO" : "SIMULACRO (sin --aplicar no se escribe nada)"}${SOLO ? ` — SOLO #${SOLO}` : ""}\n`);
console.log(`A cobrar: ${aCobrar.length}  $${aCobrar.reduce((a, f) => a + f.s.monto, 0).toLocaleString("es-CL")}`);
if (bloqueadas.length) console.log(`Excluidas por la clasificacion: ${bloqueadas.length} -> ${bloqueadas.map((f) => `#${f.s.id}(${f.v})`).join(", ")}`);
for (const f of aCobrar) {
  const p = pedidoDe.get(f.s.patente || norm(f.c?.patente || ""));
  console.log(`  #${f.s.id} ${(f.s.patente || "?").padEnd(7)} ${String(f.c?.nombre || "").slice(0, 26).padEnd(26)} $${f.s.monto} vence ${f.venc} | pedido viejo: ${p ? "#" + p.id : "ninguno"}`);
}

if (!APLICAR) {
  console.log(`\n(dry-run. Para una sola de prueba: --aplicar --solo=<id>. Para todas: --aplicar)`);
  process.exit(0);
}

const cobro = new Date(Date.now() + MINUTOS_ADELANTE * 60_000).toISOString().slice(0, 19).replace("T", " ");
console.log(`\nAgendando cobro para ${cobro} (UTC)\n`);
let ok = 0;
for (const f of aCobrar) {
  const etiqueta = `#${f.s.id} ${f.s.patente} ${String(f.c?.nombre || "").slice(0, 22)}`;
  try {
    const p = pedidoDe.get(f.s.patente || norm(f.c?.patente || ""));
    if (p) await api(`orders/${p.id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    const act = await api(`subscriptions/${f.s.id}`, { method: "PUT", body: JSON.stringify({ status: "active" }) });
    if (act.status !== "active") throw new Error(`no quedo active, quedo "${act.status}"`);
    // PUT aparte: junto con status, WooCommerce ignora next_payment_date.
    await api(`subscriptions/${f.s.id}`, { method: "PUT", body: JSON.stringify({ next_payment_date: cobro }) });
    const fin = await api(`subscriptions/${f.s.id}`);
    const quedo = String(fin.next_payment_date_gmt || "").slice(0, 16);
    const bien = fin.status === "active" && quedo.startsWith(cobro.slice(0, 10));
    if (bien) ok++;
    console.log(`  ${bien ? "OK  " : "MAL "} ${etiqueta} -> ${fin.status}, cobra ${quedo || "-"}${p ? ` (pedido #${p.id} cancelado)` : ""}`);
  } catch (e) {
    console.error(`  ERROR ${etiqueta}: ${e}`);
  }
}
console.log(`\nAgendadas: ${ok}/${aCobrar.length}. El cobro real lo hace Action Scheduler en ~${MINUTOS_ADELANTE} min; verificar que el pedido nuevo quede "processing".`);
