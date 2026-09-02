// Prueba de una sola suscripcion: que forma acepta la REST API de WooCommerce
// Subscriptions para mover next_payment_date. Al reactivar (status: active) el
// campo se ignora, y quedan con la fecha vencida que traian -> al destrabar el
// staging lock cobrarian de inmediato un mes ya pagado.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-fecha.mts <subId> <fecha-ISO-sin-Z>
import "dotenv/config";

const [id, fecha] = process.argv.slice(2);
const u = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");

const get = async () => {
  const r = await fetch(`${u}/wp-json/wc/v3/subscriptions/${id}`, { headers: { Authorization: auth } });
  return r.json();
};
const put = async (body: Record<string, unknown>) => {
  const r = await fetch(`${u}/wp-json/wc/v3/subscriptions/${id}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return [r.status, await r.json()] as const;
};

console.log("antes:", (await get()).next_payment_date_gmt);

const wp = fecha.replace("T", " ");
for (const body of [
  { next_payment_date: wp },
  { next_payment_date_gmt: wp },
]) {
  const [st, s] = await put(body);
  const ahora = (await get()).next_payment_date_gmt;
  console.log(`${JSON.stringify(body).padEnd(60)} -> HTTP ${st} | next ahora: ${ahora} | ${ahora?.startsWith(fecha.slice(0, 10)) ? "FUNCIONA" : "no aplica"}`);
  if (ahora?.startsWith(fecha.slice(0, 10))) break;
  if (st >= 400) console.log("   ", JSON.stringify(s).slice(0, 200));
}
