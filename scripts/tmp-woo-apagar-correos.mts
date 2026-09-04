// Apaga TODOS los correos que manda WooCommerce (los del sistema viejo de
// WordPress: pedido nuevo, factura, renovacion, pago fallido, etc.). Ahora las
// comunicaciones al cliente salen desde la app (reglas de correo + Resend), asi
// que los de Woo llegan duplicados o contradiciendo lo que dice la app.
//
// Sin flag: solo lista lo que esta prendido (no toca nada).
// Con --aplicar: pone enabled=no en cada uno y deja respaldo de cuales estaban
// prendidos, en respaldo-correos-woo-<fecha>.json.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-apagar-correos.mts [--aplicar]
import { writeFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const site = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");

async function woo(path: string, init?: RequestInit) {
  const r = await fetch(`${site}${path}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`WooCommerce ${r.status} ${path}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function main() {
  const grupos: any[] = await woo("/wp-json/wc/v3/settings");
  // Los correos son los grupos hijos de "email" (email_new_order,
  // email_customer_invoice, los de Subscriptions, etc.).
  const deCorreo = grupos.filter((g) => g.parent_id === "email" || /^email_/.test(g.id));

  const prendidos: { id: string; label: string }[] = [];
  for (const g of deCorreo) {
    const opciones: any[] = await woo(`/wp-json/wc/v3/settings/${g.id}`);
    const enabled = opciones.find((o) => o.id === "enabled");
    if (!enabled) continue; // algunos (ej. opciones de plantilla) no se prenden/apagan
    const on = enabled.value === "yes" || enabled.value === true || enabled.value === "1";
    console.log(`${on ? "PRENDIDO " : "apagado  "} ${g.id.padEnd(38)} ${g.label ?? ""}`);
    if (on) prendidos.push({ id: g.id, label: g.label ?? g.id });
  }

  console.log(`\n${prendidos.length} de ${deCorreo.length} correos de WooCommerce estan prendidos.`);
  if (!prendidos.length) return;
  if (!APLICAR) {
    console.log("Nada tocado. Para apagarlos de verdad: agregar --aplicar");
    return;
  }

  const fecha = new Date().toISOString().slice(0, 10);
  writeFileSync(`respaldo-correos-woo-${fecha}.json`, JSON.stringify(prendidos, null, 2), "utf8");
  for (const p of prendidos) {
    await woo(`/wp-json/wc/v3/settings/${p.id}/enabled`, { method: "PUT", body: JSON.stringify({ value: "no" }) });
    console.log(`apagado: ${p.id}`);
  }
  console.log(`\nListo. Respaldo de los que estaban prendidos: respaldo-correos-woo-${fecha}.json`);
}
main();
