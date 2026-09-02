// Cierra los casos que la limpieza previa al destrabe dejo abiertos:
// duplicadas (una patente con 2 suscripciones vivas) y las dos que parecian
// "sin vencimiento" pero en realidad eran cambios de patente.
//
// REVIVIR = volver a "active" y ponerle la fecha de cobro (en un PUT aparte:
// WooCommerce ignora next_payment_date si viene junto con otros campos, ver
// tmp-woo-alinear-cobro.mts).
// ELIMINAR = a la papelera (DELETE sin force), reversible desde WP admin.
//
//   SVKR55  revive #7847 (start 9-ago, la vigente) | elimina #7010 (termino el 9-ago)
//   TZCH85  revive #5859 (last_pay 14-ago = wc-7925) | elimina #5861 -> OJO: este
//           cliente venia pagando DOS veces desde mayo (wc-5857+5860 el 14-may,
//           wc-6743+6744 el 14-jun, wc-7445+7468 el 14/16-jul): ~$65.970 de mas.
//   GXKT58  elimina #5554 (abandonada) y DEJA CANCELADA #6530: tiene 8 pasadas
//           en el ciclo, o sea es TOPE y le corresponde el corte + oferta X5.
//   #5001   revive: la suscripcion es de NICOLAS SOTO CID, que cambio de patente
//           KHFS61 -> JDFK85. Vigente al 9-sep, 1 pasada, sin Oneclick propio:
//           esta era su unica via de renovacion.
//   #4689   NO se toca: es de CRISTOFER MORA (FGVT23 -> HSXR40), que ya tiene
//           Oneclick propio cobrando el 30-sep. Cancelarla fue lo correcto.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-arreglar-duplicadas.mts [--aplicar]
const APLICAR = process.argv.includes("--aplicar");
const u = process.env.WOOCOMMERCE_SITE_URL!;
const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");

const REVIVIR: { id: number; patente: string; quien: string; cobro: string }[] = [
  { id: 7847, patente: "SVKR55", quien: "NICOLAS AVILA LANDEROS", cobro: "2026-09-09 00:00:00" },
  { id: 5859, patente: "TZCH85", quien: "JORGE VELASQUEZ CEBALLOS", cobro: "2026-09-14 00:00:00" },
  { id: 5001, patente: "JDFK85 (ex KHFS61)", quien: "NICOLAS SOTO CID", cobro: "2026-09-09 00:00:00" },
];
const ELIMINAR: { id: number; patente: string; por: string }[] = [
  { id: 7010, patente: "SVKR55", por: "termino el 9-ago, la reemplazo #7847" },
  { id: 5861, patente: "TZCH85", por: "duplicada real: venia cobrando en paralelo a #5859" },
  { id: 5554, patente: "GXKT58", por: "abandonada desde jun, la vigente era #6530" },
];

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${u}/wp-json/wc/v3/${path}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 220)}`);
  return t ? JSON.parse(t) : null;
}

console.log(APLICAR ? "EJECUTANDO\n" : "SIMULACRO (sin --aplicar no se escribe nada)\n");
console.log("REVIVIR:");
for (const r of REVIVIR) {
  const s = await api(`subscriptions/${r.id}`);
  console.log(`  #${r.id} ${r.patente.padEnd(18)} ${r.quien.slice(0, 24).padEnd(24)} ahora=${s.status} next=${(s.next_payment_date_gmt || "-").slice(0, 10)} -> active, cobra ${r.cobro.slice(0, 10)}`);
}
console.log("ELIMINAR (a la papelera):");
for (const e of ELIMINAR) {
  const s = await api(`subscriptions/${e.id}`);
  console.log(`  #${e.id} ${e.patente.padEnd(18)} ahora=${s.status} — ${e.por}`);
}

if (!APLICAR) {
  console.log("\n(dry-run: no se movio nada. Correr con --aplicar para ejecutar.)");
} else {
  console.log("\n--- aplicando ---");
  for (const r of REVIVIR) {
    try {
      const a = await api(`subscriptions/${r.id}`, { method: "PUT", body: JSON.stringify({ status: "active" }) });
      if (a.status !== "active") throw new Error(`quedo en "${a.status}"`);
      // Segundo PUT, solo: junto con status, WooCommerce ignora la fecha.
      await api(`subscriptions/${r.id}`, { method: "PUT", body: JSON.stringify({ next_payment_date: r.cobro }) });
      const fin = await api(`subscriptions/${r.id}`);
      const ok = fin.status === "active" && String(fin.next_payment_date_gmt || "").slice(0, 10) === r.cobro.slice(0, 10);
      console.log(`  ${ok ? "OK  " : "MAL "} #${r.id} ${r.patente} -> ${fin.status}, cobra ${(fin.next_payment_date_gmt || "-").slice(0, 10)}`);
    } catch (err) {
      console.error(`  ERROR #${r.id} ${r.patente}: ${err}`);
    }
  }
  for (const e of ELIMINAR) {
    try {
      await api(`subscriptions/${e.id}`, { method: "DELETE" });
      console.log(`  OK   #${e.id} ${e.patente} a la papelera`);
    } catch (err) {
      console.error(`  ERROR #${e.id} ${e.patente}: ${err}`);
    }
  }
}

console.log(`\nOJO TZCH85 (JORGE VELASQUEZ): pago dos veces may/jun/jul, ~$65.970 de mas. Definir devolucion o abono.`);
