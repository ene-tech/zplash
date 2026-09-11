// Corta en WooCommerce los cobros que quedaron vivos allá cuando la app creía
// haberlos cancelado, y limpia las marcas `renovacion_auto_woo_desde` que ya
// no corresponden a ninguna suscripción viva.
//
// Sale de la revisión del 9-sep-2026: el corte de Woo que hacen la ficha del
// cliente y la baja de tarjeta de Mi Cuenta venía fallando en silencio (la app
// mandaba igual el correo de "tu suscripción quedó cancelada"), así que hay
// clientes con el correo mandado y la suscripción cobrando.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/tmp-woo-cortar-cobros-dobles.mts
//   npx tsx --env-file=.env.local scripts/tmp-woo-cortar-cobros-dobles.mts --aplicar
//
// Sin --aplicar no escribe nada, ni en Woo ni en la base. Con --aplicar deja
// respaldo-woo-cortar-cobros-dobles-<fecha>.json antes de tocar nada.
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const aplicar = process.argv.includes("--aplicar");
const site = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");

type Sub = { id: number; status: string; billing?: Record<string, unknown>; meta_data?: { key?: string; value?: unknown }[]; next_payment_date_gmt?: string; total?: string };

async function wooGet(path: string): Promise<any[]> {
  const out: any[] = [];
  let p = 1,
    tp = 1;
  do {
    const r = await fetch(`${site}${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${p}`, { headers: { Authorization: auth } });
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
    tp = Number(r.headers.get("x-wp-totalpages")) || 1;
    out.push(...(await r.json()));
    p++;
  } while (p <= tp);
  return out;
}

const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Misma extracción que src/lib/pagos/cancelarSuscripcionWooCommerceLegacy.ts.
function patenteDe(sub: Sub): string {
  const c: string[] = [];
  for (const [k, v] of Object.entries(sub.billing || {})) if (typeof v === "string" && /patente/i.test(k)) c.push(v);
  for (const m of sub.meta_data || []) if (m && typeof m.key === "string" && /patente/i.test(m.key) && typeof m.value === "string") c.push(m.value);
  return norm(c.find((x) => x && x.trim()) || "");
}
const emailDe = (sub: Sub) => String((sub.billing || {}).email || "").trim().toLowerCase();

const activas = (await wooGet("/wp-json/wc/v3/subscriptions?status=active")) as Sub[];
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

// Estado de cobro de cada patente en NUESTRO sistema. "activa" es la única que
// el cron (/api/pagos/oneclick/cobrar) cobra: pendiente_solo_tarjeta tiene la
// tarjeta guardada pero no cobra nada, así que ahí Woo es su ÚNICA renovación
// y cancelarla lo dejaría sin plan.
const oneclick = new Map<string, string>();
for (const r of await sql<{ patente: string; estado: string }[]>`select patente, estado from suscripciones_oneclick`) {
  if (r.estado === "activa" || !oneclick.has(r.patente)) oneclick.set(norm(r.patente), r.estado);
}
const marcados = await sql<{ id: string; patente: string; email: string | null; plan: string | null; vence: string | null }[]>`
  select id, patente, email, plan, to_char(vencimiento, 'YYYY-MM-DD') as vence from clientes where renovacion_auto_woo_desde is not null`;

// Solo para mostrar en el dry-run: qué plan tiene cada patente en la base.
const fichas = new Map<string, { plan: string | null; vence: string | null }>();
for (const r of await sql<{ patente: string; plan: string | null; vence: string | null }[]>`
  select patente, plan, to_char(vencimiento, 'YYYY-MM-DD') as vence from clientes`) {
  fichas.set(norm(r.patente), { plan: r.plan, vence: r.vence });
}

// --- Grupo A: la app dio la baja por hecha y Woo sigue cobrando -------------
// Las tres que quedaron con el correo de cancelación mandado al cliente
// (disparos_regla_correo de la regla "suscripcion_cancelada") y la suscripción
// viva. Van por ID para no depender de volver a clasificarlas.
const GRUPO_A = [
  { id: 5083, patente: "KXXB57", nota: "cancelada en la ficha el 9-sep, cobra el 12-sep" },
  { id: 6316, patente: "SZGJ49", nota: "cancelada en la ficha el 3-sep" },
  { id: 4968, patente: "KZLG52", nota: "cancelada en la ficha el 7-sep, Woo le cobró igual el 9-sep" },
];

// --- Grupo B: cobro doble (tarjeta Oneclick cobrando + Woo activo) ----------
const grupoB = activas
  .filter((s) => oneclick.get(patenteDe(s)) === "activa")
  .filter((s) => !GRUPO_A.some((a) => a.id === s.id));

// --- Grupo C: marcas huérfanas ---------------------------------------------
// Cliente marcado como "RA WOO" sin ninguna suscripción activa que le calce,
// ni por patente ni por email. Con la marca puesta la ficha ofrece un botón que
// no aplica, el portal le dice que su renovación la maneja el sistema anterior,
// y las reglas de correo lo saltan de los avisos de vencimiento por creerlo
// autorrenovable.
const patentesVivas = new Set(activas.map(patenteDe));
const emailsVivos = new Set(activas.map(emailDe));
const grupoC = marcados.filter((c) => {
  const p = norm(c.patente);
  const e = (c.email || "").trim().toLowerCase();
  return !patentesVivas.has(p) && !(e && emailsVivos.has(e));
});

const porId = new Map(activas.map((s) => [s.id, s]));
console.log(`${activas.length} suscripciones activas en WooCommerce\n`);

console.log(`== A. canceladas en la app pero vivas en Woo: ${GRUPO_A.length} ==`);
for (const a of GRUPO_A) {
  const s = porId.get(a.id);
  console.log(`  #${a.id} ${a.patente} ${s ? `$${s.total} próx ${s.next_payment_date_gmt}` : "(ya no está activa)"} — ${a.nota}`);
}

console.log(`\n== B. cobro doble (Oneclick activa + Woo activo): ${grupoB.length} ==`);
for (const s of grupoB) {
  const f = fichas.get(patenteDe(s));
  console.log(`  #${s.id} ${patenteDe(s)} ${emailDe(s)} $${s.total} próx Woo ${s.next_payment_date_gmt} | base: ${f?.plan || "sin plan"} vence ${f?.vence || "—"}`);
}

console.log(`\n== C. marcas "RA WOO" sin suscripción viva: ${grupoC.length} ==`);
for (const c of grupoC) console.log(`  ${c.patente} ${c.email || "sin email"} plan=${c.plan || "—"} vence=${c.vence || "—"}`);

const aCancelar = [...GRUPO_A.map((a) => a.id).filter((id) => porId.has(id)), ...grupoB.map((s) => s.id)];
if (!aplicar) {
  console.log(`\nDRY-RUN. Con --aplicar: cancela ${aCancelar.length} suscripciones en Woo y limpia ${grupoC.length} marcas.`);
  await sql.end();
  process.exit(0);
}

const respaldo = `respaldo-woo-cortar-cobros-dobles-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(respaldo, JSON.stringify({ cancelar: aCancelar.map((id) => porId.get(id)), limpiarMarca: grupoC }, null, 2));
console.log(`\nRespaldo en ${respaldo}`);

for (const id of aCancelar) {
  const r = await fetch(`${site}/wp-json/wc/v3/subscriptions/${id}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  console.log(`  #${id} -> ${r.status} ${r.ok ? "cancelada" : await r.text()}`);
}

// La marca la limpia sola el webhook de suscripción para las que se acaban de
// cancelar; acá van solo las huérfanas, que no generan webhook porque en Woo ya
// no queda nada que cambie de estado.
if (grupoC.length) {
  await sql`update clientes set renovacion_auto_woo_desde = null where id in ${sql(grupoC.map((c) => c.id))}`;
  console.log(`\n${grupoC.length} marcas limpiadas.`);
}
await sql.end();
