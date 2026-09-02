// SOLO LECTURA: cruza los pedidos de renovacion pendientes en WooCommerce
// (los del staging lock, ago-2026) contra el estado del plan en nuestra base,
// para ver a quien se le cobraria dos veces si se destraba el lock.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-backlog.mts
import postgres from "postgres";

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

const pend = await woo(`/wp-json/wc/v3/orders?status=pending&after=2026-08-13T00:00:00&orderby=date&order=asc`);
const subs = pend.filter((o) => o.created_via === "subscription");

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const { clientesRows, ventasRows } = await sql.begin(async (tx) => {
  await tx.unsafe("set transaction read only");
  const clientesRows = await tx.unsafe(`select id, patente, lower(email) email, nombre, vencimiento from clientes`);
  const ventasRows = await tx.unsafe(
    `select cliente_id, patente, tipo, fecha, precio, metodo_pago from ventas
     where fecha >= '2026-08-01' and precio >= 10000
       and (tipo ilike '%plan%' or tipo ilike '%renov%' or tipo ilike '%reactiv%' or tipo ilike '%upgrade%')
     order by fecha`
  );
  return { clientesRows, ventasRows } as any;
});
await sql.end();

const porPatente = new Map<string, any>(clientesRows.map((c: any) => [norm(c.patente), c]));
const porEmail = new Map<string, any>(clientesRows.filter((c: any) => c.email).map((c: any) => [c.email, c]));
const ventasPorClave = new Map<string, any[]>();
const push = (k: string, v: any) => { const a = ventasPorClave.get(k) || []; a.push(v); ventasPorClave.set(k, a); };
for (const v of ventasRows) {
  if (v.cliente_id) push("id:" + v.cliente_id, v);
  if (v.patente) push("pat:" + norm(v.patente), v);
}

const filas = subs.map((o) => {
  const pat = patenteDe(o);
  const email = String(o.billing?.email || "").trim().toLowerCase();
  const cli = porPatente.get(pat) || porEmail.get(email);
  const pagos = [...(cli ? ventasPorClave.get("id:" + cli.id) || [] : []), ...(ventasPorClave.get("pat:" + pat) || [])]
    .filter((v, i, a) => a.indexOf(v) === i);
  return {
    pedido: o.id,
    fecha: o.date_created_gmt.slice(0, 10),
    total: Number(o.total),
    patente: pat || "(sin patente)",
    email,
    cliente: cli?.nombre ?? null,
    clienteId: cli?.id ?? null,
    vencimiento: cli?.vencimiento ? new Date(cli.vencimiento).toISOString().slice(0, 10) : null,
    pagos: pagos.map((v) => `${new Date(v.fecha).toISOString().slice(0, 10)} ${v.tipo} ${Math.round(Number(v.precio))}`),
  };
});

// Regla: el pedido pendiente cobra el periodo que arranca en su fecha. Si
// nuestro vencimiento ya pasa esa fecha, ese periodo YA esta pagado por otro
// medio (Webpay, meson, Oneclick nuevo) -> cobrarlo seria doble cobro.
const sinCliente = filas.filter((f) => !f.clienteId);
const cubiertos = filas.filter((f) => f.clienteId && f.vencimiento && new Date(f.vencimiento) >= new Date(f.fecha));
const legitimos = filas.filter((f) => f.clienteId && !(f.vencimiento && new Date(f.vencimiento) >= new Date(f.fecha)));
const repetidas = Object.entries(filas.reduce<Record<string, number>>((a, f) => ((a[f.patente] = (a[f.patente] || 0) + 1), a), {})).filter(([, n]) => n > 1);
const plata = (fs: typeof filas) => "$" + fs.reduce((a, f) => a + f.total, 0).toLocaleString("es-CL");

console.log(`Pedidos pendientes de renovacion (created_via=subscription): ${subs.length}  ${plata(filas)}`);
console.log(`  Sin cliente en nuestra base:                    ${sinCliente.length}`);
console.log(`  YA CUBIERTOS (vencimiento >= fecha del pedido): ${cubiertos.length}  ${plata(cubiertos)}`);
console.log(`     de esos, con venta nuestra que lo prueba:    ${cubiertos.filter((f) => f.pagos.length).length}`);
console.log(`  VENCIDOS (cobro legitimo):                      ${legitimos.length}  ${plata(legitimos)}`);
console.log(`  Patentes con mas de un pedido pendiente:        ${repetidas.length} -> ${repetidas.map(([p, n]) => `${p} x${n}`).join(", ")}`);

console.log(`\n== YA CUBIERTOS: NO cobrar ==`);
for (const f of cubiertos) console.log(`  #${f.pedido} ${f.fecha} $${f.total} ${f.patente} ${f.cliente} | vence ${f.vencimiento} | ${f.pagos.join(" / ") || "(sin venta en agosto; el vencimiento igual cubre el periodo)"}`);

console.log(`\n== VENCIDOS: cobro legitimo ==`);
for (const f of legitimos) console.log(`  #${f.pedido} ${f.fecha} $${f.total} ${f.patente} ${f.cliente} | vence ${f.vencimiento}`);

console.log(`\n== SIN CLIENTE EN LA BASE ==`);
for (const f of sinCliente) console.log(`  #${f.pedido} ${f.fecha} $${f.total} ${f.patente} ${f.email}`);
