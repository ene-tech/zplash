// Repara la suscripcion #6675 (CFWC72, MIGUEL SALAMANCA), la unica que
// tmp-woo-alinear-cobro.mts no pudo alinear.
//
// Que le pasa: la cancelaron por bulk edit el 11-ago, quedo "cancelled" el
// 12-ago y el 31-ago la revivieron con el resto — pero arrastra
// cancelled_date=2026-08-11 y end_date=2026-08-12. WooCommerce valida el orden
// de fechas (start < next_payment < end), asi que rechaza con
// woocommerce_rest_invalid_payment_data cualquier next_payment_date: quedaria
// despues del fin. Resultado: suscripcion "active" que no va a cobrar nunca.
//
// El cliente esta al dia — pago hasta el 11-oct (wc-7899 del 12-ago) — asi que
// corresponde repararla, no darla de baja.
//
// Va en dos PUT a proposito: primero se borra el fin, y recien despues se puede
// poner la fecha de cobro. Ademas next_payment_date no se puede mandar junto
// con otros campos (WooCommerce lo ignora, ver tmp-woo-alinear-cobro.mts).
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-reparar-6675.mts [--aplicar]
const APLICAR = process.argv.includes("--aplicar");
const SUB = 6675;
const NUEVO_COBRO = "2026-10-11 17:39:48"; // vencimiento nuestro, en la hora de aniversario de la suscripcion

const u = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");

async function get() {
  const r = await fetch(`${u}/wp-json/wc/v3/subscriptions/${SUB}`, { headers: { Authorization: auth } });
  if (!r.ok) throw new Error(`GET ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<any>;
}
async function put(body: Record<string, string>) {
  const r = await fetch(`${u}/wp-json/wc/v3/subscriptions/${SUB}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`PUT ${JSON.stringify(body)} -> ${r.status} ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}
const fechas = (s: any) => ({ status: s.status, start: s.start_date_gmt, next: s.next_payment_date_gmt, last: s.last_payment_date_gmt, cancelled: s.cancelled_date_gmt, end: s.end_date_gmt });

const antes = await get();
console.log("ANTES: ", JSON.stringify(fechas(antes)));
console.log(`PLAN:  borrar end_date y cancelled_date, despues next_payment_date = ${NUEVO_COBRO}`);

if (!APLICAR) {
  console.log("\n(dry-run: no se movio nada. Correr con --aplicar para ejecutar.)");
  process.exit(0);
}

// Paso 1: sacar el fin y la cancelacion, que son los que bloquean el orden.
const paso1 = await put({ end_date: "", cancelled_date: "" });
console.log("PASO 1:", JSON.stringify(fechas(paso1)));
if (paso1.end_date_gmt) {
  console.error("ABORTA: end_date no se borro, no tiene sentido seguir. Hay que hacerlo a mano en WP admin.");
  process.exit(1);
}

// Paso 2: recien ahora acepta la fecha de cobro.
const paso2 = await put({ next_payment_date: NUEVO_COBRO });
console.log("PASO 2:", JSON.stringify(fechas(paso2)));

// Verifica de verdad: la API contesta 200 aunque no aplique el cambio.
const final = await get();
console.log("DESPUES:", JSON.stringify(fechas(final)));
const ok = String(final.next_payment_date_gmt || "").slice(0, 10) === NUEVO_COBRO.slice(0, 10) && !final.end_date_gmt;
console.log(ok ? "\nOK: queda activa y cobra el " + NUEVO_COBRO.slice(0, 10) : "\nNO QUEDO BIEN: revisar a mano en WP admin");
process.exit(ok ? 0 : 1);
