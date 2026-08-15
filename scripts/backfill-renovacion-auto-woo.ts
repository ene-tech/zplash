// Corrida única (no expuesta en la UI): sin esto, un cliente con suscripción
// activa en WooCommerce recién queda marcado con renovacionAutoWooDesde
// (ver db/schema/clientes.ts) en SU PRÓXIMA renovación — que puede ser en
// semanas. Este script trae las suscripciones activas AHORA vía REST API y
// completa la marca de una vez para que la tarjeta en Mi Cuenta (ver
// RenovacionLegacyCard) aparezca ya mismo, no cuando llegue el próximo
// webhook.
//
// Solo ADITIVO: nunca crea clientes ni toca ningún otro campo — si la
// patente/email de la suscripción no matchea a un cliente ya existente, se
// reporta como sin match y se salta (eso lo cubre el webhook en vivo el día
// que ese cliente sí tenga un pedido procesado). Tampoco pisa una marca que
// ya esté seteada (WHERE renovacion_auto_woo_desde IS NULL).
//
// No importa desde @/lib/dataAccess ni @/db (llevan `import "server-only"`,
// que revienta fuera del bundler de Next) — arma su propia conexión mínima,
// mismo patrón que scripts/migrar-historico-woocommerce.ts.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/backfill-renovacion-auto-woo.ts --dry-run
//   npx tsx --env-file=.env.local scripts/backfill-renovacion-auto-woo.ts

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, inArray, isNull } from "drizzle-orm";
import { clientes } from "@/db/schema";
import { normPlate } from "@/lib/helpers";

// NO hardcodear esto: "https://zplash.cl" dejó de servir WordPress/WooCommerce
// desde el corte de dominio del 12-ago-2026 (ver next.config.ts,
// REDIRECTS_LEGACY_WORDPRESS) y a la fecha de este comentario todavía no está
// confirmado a qué URL quedó (la cuenta de hosting es BanaHosting —
// ns8986/ns8987.banahosting.com son los nameservers de zplash.cl — hay que
// entrar a ese panel y confirmar/crear el subdominio correcto). Se pasa por
// env (--env-file=.env.local) para no tener que tocar este archivo cuando se
// confirme.

type SubscriptionWC = {
  id: number;
  status: string;
  date_created: string;
  billing?: Record<string, unknown>;
  meta_data?: Array<{ key?: string; value?: unknown }>;
};

// Misma lógica que extraerPatente en shared.ts / migrar-historico-woocommerce.ts.
function extraerPatente(sub: SubscriptionWC): string {
  const candidatos: string[] = [];
  const billing = sub.billing || {};
  for (const [k, v] of Object.entries(billing)) {
    if (typeof v === "string" && /patente/i.test(k)) candidatos.push(v);
  }
  if (Array.isArray(sub.meta_data)) {
    for (const m of sub.meta_data) {
      if (m && typeof m.key === "string" && /patente/i.test(m.key) && typeof m.value === "string") {
        candidatos.push(m.value);
      }
    }
  }
  return normPlate(candidatos.find((c) => c && c.trim()) || "");
}

async function fetchSuscripcionesActivas(siteUrl: string, consumerKey: string, consumerSecret: string): Promise<SubscriptionWC[]> {
  const auth = "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const perPage = 100;
  let page = 1;
  let totalPages = 1;
  const subs: SubscriptionWC[] = [];

  do {
    const url = `${siteUrl}/wp-json/wc/v3/subscriptions?per_page=${perPage}&page=${page}&status=active`;
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`WooCommerce API ${res.status} en página ${page}: ${await res.text()}`);
    totalPages = Number(res.headers.get("X-WP-TotalPages")) || 1;
    subs.push(...((await res.json()) as SubscriptionWC[]));
    console.log(`Página ${page}/${totalPages}`);
    page++;
  } while (page <= totalPages);

  return subs;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dbUrl = process.env.DATABASE_URL;
  const siteUrl = process.env.WOOCOMMERCE_SITE_URL;
  const ck = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const cs = process.env.WOOCOMMERCE_CONSUMER_SECRET;
  if (!dbUrl) throw new Error("Falta DATABASE_URL en las variables de entorno");
  if (!siteUrl) throw new Error("Falta WOOCOMMERCE_SITE_URL (URL actual del WordPress/WooCommerce — ya no es zplash.cl, ver comentario arriba)");
  if (!ck || !cs) throw new Error("Faltan WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET");

  const client = postgres(dbUrl, { prepare: false, max: 5 });
  const db = drizzle(client);

  console.log("Trayendo suscripciones activas de WooCommerce...");
  const subs = await fetchSuscripcionesActivas(siteUrl, ck, cs);
  console.log(`Total suscripciones activas: ${subs.length}`);

  const clientesExistentes = await db.select().from(clientes);
  const porPatente = new Map(clientesExistentes.map((c) => [c.patente, c]));
  const porEmail = new Map(clientesExistentes.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]));

  let matcheados = 0;
  let yaMarcados = 0;
  let sinMatch = 0;
  const idsAMarcar: string[] = [];

  for (const sub of subs) {
    const patente = extraerPatente(sub);
    const email = String((sub.billing || {}).email || "").trim().toLowerCase();
    const cliente = (patente && porPatente.get(patente)) || (email && porEmail.get(email)) || undefined;
    if (!cliente) {
      sinMatch++;
      console.log(`  Sin match: suscripción #${sub.id} (${patente || email || "sin datos"})`);
      continue;
    }
    if (cliente.renovacionAutoWooDesde) {
      yaMarcados++;
      continue;
    }
    matcheados++;
    idsAMarcar.push(cliente.id);
  }

  console.log("");
  console.log(`Ya marcados (el webhook en vivo ya los había pillado): ${yaMarcados}`);
  console.log(`Sin match en clientes: ${sinMatch}`);
  console.log(`A marcar ahora: ${matcheados}`);

  if (dryRun) {
    console.log("--dry-run: no se escribió nada.");
    await client.end();
    return;
  }
  if (!idsAMarcar.length) {
    console.log("Nada que hacer.");
    await client.end();
    return;
  }

  const ahora = new Date().toISOString();
  await db
    .update(clientes)
    .set({ renovacionAutoWooDesde: ahora })
    .where(and(inArray(clientes.id, idsAMarcar), isNull(clientes.renovacionAutoWooDesde)));

  console.log(`Marcados ${idsAMarcar.length} clientes.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
