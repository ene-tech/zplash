// SOLO LECTURA: que sigue vivo en WooCommerce (suscripciones, webhooks, pasarelas).
const site = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");
async function woo(path: string) {
  const out: any[] = []; let p = 1, tp = 1;
  do {
    const r = await fetch(`${site}${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${p}`, { headers: { Authorization: auth } });
    if (!r.ok) { console.log(`  (${path} -> ${r.status})`); return out; }
    tp = Number(r.headers.get("x-wp-totalpages")) || 1;
    out.push(...(await r.json())); p++;
  } while (p <= tp);
  return out;
}
console.log("== suscripciones por estado ==");
for (const e of ["active", "on-hold", "pending", "pending-cancel", "cancelled", "expired"]) {
  const s = await woo(`/wp-json/wc/v3/subscriptions?status=${e}`);
  console.log(`${e.padEnd(16)} ${s.length}`);
}
console.log("\n== webhooks ==");
for (const w of await woo("/wp-json/wc/v3/webhooks")) console.log(`[${w.status}] ${w.topic.padEnd(22)} ${w.delivery_url}`);
console.log("\n== pasarelas de pago habilitadas ==");
for (const g of await woo("/wp-json/wc/v3/payment_gateways")) if (g.enabled) console.log(`${g.id.padEnd(24)} ${g.title}`);
console.log("\n== pedidos ultimos 30 dias ==");
const desde = new Date(Date.now() - 30 * 864e5).toISOString();
console.log(`${(await woo(`/wp-json/wc/v3/orders?after=${desde}`)).length} pedidos`);
