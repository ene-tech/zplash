// Alinea el proximo cobro de WooCommerce con el vencimiento real de nuestra
// base, en toda suscripcion activa cuya fecha de cobro quedo en el pasado.
//
// Por que hace falta: al reactivar una suscripcion cancelada, WooCommerce
// IGNORA el next_payment_date que venga en el mismo PUT y le deja la fecha
// vencida que traia de cuando cayo en on-hold (probado en
// scripts/tmp-woo-fecha.mts). Con el staging lock puesto no pasa nada, pero
// apenas se destrabe, WooCommerce procesa esas renovaciones atrasadas de
// inmediato: le cobra otro mes a alguien que ya tiene su plan pagado hasta
// septiembre.
//
// La fecha va en `next_payment_date` (NO en `next_payment_date_gmt`, que la
// API acepta con 200 y no aplica) y con formato "Y-m-d H:i:s". El sitio corre
// en UTC (gmt_offset 0), asi que la hora de sitio es la misma que la GMT.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-alinear-cobro.mts [--aplicar]
import postgres from "postgres";

const APLICAR = process.argv.includes("--aplicar");
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
const clientes = await sql.begin(async (tx) => {
  await tx.unsafe("set transaction read only");
  return tx.unsafe(`select id, patente, lower(email) email, nombre, vencimiento from clientes`);
});
await sql.end();

const porPatente = new Map<string, any>((clientes as any[]).map((c) => [norm(c.patente), c]));
const porEmail = new Map<string, any>((clientes as any[]).filter((c) => c.email).map((c) => [c.email, c]));

const activas = await woo("/wp-json/wc/v3/subscriptions?status=active&");
const ahora = new Date();

type Fila = { sub: any; cliente: any; nueva: Date | null; motivo: string };
const filas: Fila[] = [];
for (const s of activas) {
  const prox = s.next_payment_date_gmt ? new Date(s.next_payment_date_gmt + "Z") : null;
  if (prox && prox > ahora) continue; // ya esta en el futuro, no se toca
  const cliente = porPatente.get(patenteDe(s)) || porEmail.get(String(s.billing?.email || "").trim().toLowerCase());
  const venc = cliente?.vencimiento ? new Date(cliente.vencimiento) : null;
  filas.push({
    sub: s,
    cliente,
    nueva: venc && venc > ahora ? venc : null,
    motivo: !cliente ? "sin cliente en la base" : !venc ? "cliente sin vencimiento" : venc <= ahora ? "cliente vencido: no corresponde reprogramar, revisar a mano" : "ok",
  });
}

const aMover = filas.filter((f) => f.nueva);
const problemas = filas.filter((f) => !f.nueva);

console.log(`Suscripciones activas: ${activas.length}`);
console.log(`  con proximo cobro en el pasado: ${filas.length}`);
console.log(`  se pueden alinear al vencimiento: ${aMover.length}`);
console.log(`  a revisar a mano: ${problemas.length}`);
console.log("");
for (const f of aMover) {
  console.log(`  #${f.sub.id} ${f.cliente.patente} ${String(f.cliente.nombre).slice(0, 24).padEnd(24)} ${String(f.sub.next_payment_date_gmt).slice(0, 10)} -> ${f.nueva!.toISOString().slice(0, 10)}`);
}
for (const f of problemas) console.log(`  REVISAR #${f.sub.id} ${patenteDe(f.sub)} — ${f.motivo}`);

if (!APLICAR) {
  console.log("\n(dry-run: no se movio nada. Correr con --aplicar para ejecutar.)");
  process.exit(0);
}

let ok = 0;
const errores: string[] = [];
for (const f of aMover) {
  const fecha = f.nueva!.toISOString().slice(0, 19).replace("T", " ");
  const r = await fetch(`${u}/wp-json/wc/v3/subscriptions/${f.sub.id}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ next_payment_date: fecha }),
  });
  if (!r.ok) {
    errores.push(`#${f.sub.id} ${f.cliente.patente} ${r.status} ${(await r.text()).slice(0, 140)}`);
    continue;
  }
  const s = await r.json();
  // Verifica de verdad: la API contesta 200 aunque no aplique el cambio.
  if (String(s.next_payment_date_gmt || "").slice(0, 10) !== f.nueva!.toISOString().slice(0, 10)) {
    errores.push(`#${f.sub.id} ${f.cliente.patente} no aplico: quedo en ${s.next_payment_date_gmt}`);
  } else ok++;
  if ((ok + errores.length) % 20 === 0) console.log(`  ${ok + errores.length}/${aMover.length}...`);
}
console.log(`\nAlineadas: ${ok}/${aMover.length}`);
for (const e of errores) console.log("  ERROR " + e);
