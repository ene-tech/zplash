// SOLO LECTURA. Compara, para cada suscripción ACTIVA de WooCommerce, el
// próximo cobro de Woo (next_payment) con el vencimiento de la ficha.
//
// Si Woo ya cobró el mes, la ficha tiene que cubrir hasta el día anterior al
// próximo cobro. Una ficha que vence antes = cliente que pagó y el mesón ve
// Vencido (caso RLVH74, nov-2026: el webhook armaba el ciclo con la fecha de
// creación del pedido y no con la del pago).
//
// Uso: npx tsx --env-file=.env.local scripts/diag-woo-ficha-vs-proximo-cobro.mts [--json]
// Woo: solo GET. Base: transacción read only.
import postgres from "postgres";

const site = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");
const json = process.argv.includes("--json");

type Sub = Record<string, any>;
const subs: Sub[] = [];
for (let p = 1, total = 1; p <= total; p++) {
  const r = await fetch(`${site}/wp-json/wc/v3/subscriptions?status=active&per_page=100&page=${p}`, { headers: { Authorization: auth } });
  if (!r.ok) throw new Error(`Woo respondió ${r.status} en la página ${p}`);
  total = Number(r.headers.get("x-wp-totalpages")) || 1;
  subs.push(...(await r.json()));
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
function patenteDe(s: Sub): string {
  for (const [k, v] of Object.entries(s.billing ?? {})) if (typeof v === "string" && /patente/i.test(k) && v.trim()) return norm(v);
  for (const m of s.meta_data ?? []) if (/patente/i.test(m?.key ?? "") && typeof m.value === "string" && m.value.trim()) return norm(m.value);
  return "";
}
const gmt = (v?: string) => (v ? new Date(/Z$/.test(v) ? v : v + "Z") : null);
const diaChile = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
const DIA = 864e5;

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const clientes = await sql.begin(async (tx) => {
  await tx.unsafe("set transaction read only");
  return tx`select id, patente, lower(email) email, vencimiento, renovacion_auto_woo_desde from clientes`;
});
await sql.end();
const porPatente = new Map(clientes.map((c) => [norm(c.patente ?? ""), c]));
const porEmail = new Map(clientes.filter((c) => c.email).map((c) => [c.email, c]));

const hoy = diaChile(new Date());
const filas: any[] = [];
let sinFicha = 0, sinProximo = 0;
for (const s of subs) {
  const prox = gmt(s.next_payment_date_gmt);
  if (!prox) { sinProximo++; continue; }
  const patente = patenteDe(s);
  const c = porPatente.get(patente) ?? porEmail.get(String(s.billing?.email ?? "").toLowerCase());
  if (!c) { sinFicha++; continue; }
  const venc = c.vencimiento ? new Date(c.vencimiento) : null;
  // La ficha debería vencer el día anterior al próximo cobro (o después).
  const debe = diaChile(new Date(prox.getTime() - DIA));
  const tiene = venc ? diaChile(venc) : "(sin vencimiento)";
  if (!venc || tiene < debe) {
    const diasCorta = venc ? Math.round((Date.parse(debe) - Date.parse(tiene)) / DIA) : null;
    filas.push({
      patente: c.patente,
      sub: s.id,
      ficha_vence: tiene,
      proximo_cobro_woo: diaChile(prox),
      dias_corta: diasCorta,
      hoy_mesón: venc && tiene >= hoy ? "Vigente" : "VENCIDO",
      ultimo_pago_woo: s.last_payment_date_gmt ? diaChile(gmt(s.last_payment_date_gmt)!) : "-",
      // Para el arreglo: llevar la ficha hasta la hora del próximo cobro.
      vencimiento_propuesto_utc: prox.toISOString(),
      vencimiento_actual_utc: venc?.toISOString() ?? null,
    });
  }
}
filas.sort((a, b) => (b.dias_corta ?? 999) - (a.dias_corta ?? 999));

if (json) console.log(JSON.stringify(filas, null, 2));
else {
  console.log(`Suscripciones Woo activas: ${subs.length} · sin ficha: ${sinFicha} · sin próximo cobro: ${sinProximo}`);
  console.log(`Fichas que vencen ANTES del mes que Woo ya cobró: ${filas.length} (de ellas hoy VENCIDO en el mesón: ${filas.filter((f) => f["hoy_mesón"] === "VENCIDO").length})`);
  if (filas.length) console.table(filas.map(({ vencimiento_propuesto_utc, vencimiento_actual_utc, ...f }) => f));
}
