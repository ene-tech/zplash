// SOLO LECTURA: estado de TODAS las plantillas de correo de WooCommerce,
// incluidas las que no exponen interruptor "enabled" en la API.
const site = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");
const woo = async (p: string) => {
  const r = await fetch(`${site}${p}`, { headers: { Authorization: auth } });
  if (!r.ok) throw new Error(`${r.status} ${p}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
const grupos: any[] = await woo("/wp-json/wc/v3/settings");
const deCorreo = grupos.filter((g) => g.parent_id === "email" || /^email_/.test(g.id));
const sinInterruptor: string[] = [], prendidos: string[] = [];
for (const g of deCorreo) {
  const ops: any[] = await woo(`/wp-json/wc/v3/settings/${g.id}`);
  const en = ops.find((o) => o.id === "enabled");
  if (!en) { sinInterruptor.push(`${g.id} — ${g.label ?? ""}`); continue; }
  const on = en.value === "yes" || en.value === true || en.value === "1";
  if (on) prendidos.push(`${g.id} — ${g.label ?? ""}`);
}
console.log(`Grupos de correo: ${deCorreo.length}`);
console.log(`Con interruptor y PRENDIDOS: ${prendidos.length}`);
prendidos.forEach((p) => console.log(`  PRENDIDO ${p}`));
console.log(`\nSin interruptor en la API (no se pueden apagar por acá): ${sinInterruptor.length}`);
sinInterruptor.forEach((s) => console.log(`  ${s}`));
