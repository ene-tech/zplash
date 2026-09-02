// Cancela en WooCommerce las suscripciones que ya no corresponden, para dejar
// vivas SOLO las que siguen activas y al dia, y poder destrabar el staging
// lock (ver woo-staging-site-lock) sin cobrarle dos veces a nadie.
//
// Se cancela:
//   A. on-hold        -> la renovacion fallo por el lock, el cliente ya no
//                        esta siendo cobrado por Woo.
//   B. pending        -> nunca llegaron a activarse.
//   C. duplicadas     -> misma patente con mas de una suscripcion viva:
//                        se deja la de next_payment mas lejano.
//   D. activas ya cubiertas -> nuestro vencimiento pasa el proximo cobro de
//                        Woo, o sea el cliente ya renovo con nosotros.
// Se deja intacto: pending-cancel (el cliente ya la termino, corre hasta el
// final del periodo pagado) y las activas al dia.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-cancelar.mts [--aplicar]
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
  for (const li of o.line_items || []) for (const m of li.meta_data || []) if (/patente/i.test(String(m?.key)) && typeof m?.value === "string") cands.push(m.value);
  return norm(cands.find((c) => c && c.trim()) || "");
}

const [onHold, pending, activas] = await Promise.all([
  woo("/wp-json/wc/v3/subscriptions?status=on-hold&"),
  woo("/wp-json/wc/v3/subscriptions?status=pending&"),
  woo("/wp-json/wc/v3/subscriptions?status=active&"),
]);

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const { clientesRows, oneclickRows } = await sql.begin(async (tx) => {
  await tx.unsafe("set transaction read only");
  const clientesRows = await tx.unsafe(`select id, patente, lower(email) email, nombre, vencimiento from clientes`);
  const oneclickRows = await tx.unsafe(`select cliente_id from suscripciones_oneclick where estado in ('activa','pendiente')`);
  return { clientesRows, oneclickRows } as any;
});
await sql.end();

const porPatente = new Map<string, any>(clientesRows.map((c: any) => [norm(c.patente), c]));
const porEmail = new Map<string, any>(clientesRows.filter((c: any) => c.email).map((c: any) => [c.email, c]));
const conOneclick = new Set<string>(oneclickRows.map((r: any) => r.cliente_id));
const clienteDe = (s: any) => porPatente.get(patenteDe(s)) || porEmail.get(String(s.billing?.email || "").trim().toLowerCase());

type Item = { sub: any; motivo: string; detalle: string };
const aCancelar: Item[] = [];
const seQuedan: any[] = [];

for (const s of onHold) aCancelar.push({ sub: s, motivo: "on-hold", detalle: `venia fallando desde ${(s.date_modified || "").slice(0, 10)}` });
for (const s of pending) aCancelar.push({ sub: s, motivo: "pending", detalle: `creada ${(s.date_created || "").slice(0, 10)}, nunca activada` });

// Duplicadas: entre las ACTIVAS de una misma patente se deja la de proximo
// cobro mas lejano (la que el cliente pago ultimo) y se cancelan las otras.
const porPatenteActivas = new Map<string, any[]>();
for (const s of activas) {
  const k = patenteDe(s) || `email:${s.billing?.email}`;
  porPatenteActivas.set(k, [...(porPatenteActivas.get(k) || []), s]);
}

for (const [, subsMismaPatente] of porPatenteActivas) {
  const ordenadas = [...subsMismaPatente].sort((a, b) => String(b.next_payment_date_gmt || "").localeCompare(String(a.next_payment_date_gmt || "")));
  const [conservar, ...duplicadas] = ordenadas;
  for (const d of duplicadas) aCancelar.push({ sub: d, motivo: "duplicada", detalle: `misma patente que #${conservar.id}` });

  const cli = clienteDe(conservar);
  const venc = cli?.vencimiento ? new Date(cli.vencimiento) : null;
  const prox = conservar.next_payment_date_gmt ? new Date(conservar.next_payment_date_gmt + "Z") : null;
  if (cli && conOneclick.has(cli.id)) {
    aCancelar.push({ sub: conservar, motivo: "ya-en-oneclick", detalle: `${cli.nombre} ya tiene suscripcion Oneclick nuestra` });
  } else if (venc && prox && venc >= prox) {
    aCancelar.push({ sub: conservar, motivo: "ya-cubierta", detalle: `vence ${venc.toISOString().slice(0, 10)} >= proximo cobro Woo ${prox.toISOString().slice(0, 10)}` });
  } else {
    seQuedan.push({ sub: conservar, cli, prox });
  }
}

const porMotivo = aCancelar.reduce<Record<string, number>>((a, i) => ((a[i.motivo] = (a[i.motivo] || 0) + 1), a), {});
console.log(`A CANCELAR: ${aCancelar.length}`);
for (const [m, n] of Object.entries(porMotivo)) console.log(`   ${m.padEnd(14)} ${n}`);
console.log(`SE QUEDAN ACTIVAS: ${seQuedan.length}`);
console.log(`   proximo cobro: ${seQuedan.map((x) => (x.prox ? x.prox.toISOString().slice(0, 10) : "?")).sort()[0]} .. ${seQuedan.map((x) => (x.prox ? x.prox.toISOString().slice(0, 10) : "?")).sort().slice(-1)[0]}`);
console.log("");
for (const i of aCancelar.filter((i) => i.motivo !== "on-hold")) {
  console.log(`  [${i.motivo}] #${i.sub.id} ${patenteDe(i.sub)} ${i.sub.billing?.first_name || ""} ${i.sub.billing?.last_name || ""} — ${i.detalle}`);
}

if (!APLICAR) {
  console.log("\n(dry-run: no se cancelo nada. Correr con --aplicar para ejecutar.)");
  process.exit(0);
}

let ok = 0;
const errores: string[] = [];
for (const [n, i] of aCancelar.entries()) {
  const r = await fetch(`${u}/wp-json/wc/v3/subscriptions/${i.sub.id}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (r.ok) { ok++; } else { errores.push(`#${i.sub.id} ${r.status} ${(await r.text()).slice(0, 120)}`); }
  if ((n + 1) % 25 === 0) console.log(`  ${n + 1}/${aCancelar.length}...`);
}
console.log(`\nCanceladas: ${ok}/${aCancelar.length}`);
for (const e of errores) console.log("  ERROR " + e);
