import "server-only";
import { normPlate } from "@/lib/helpers";

// NO hardcodear esto: "https://zplash.cl" dejó de servir WordPress/WooCommerce
// desde el corte de dominio del 12-ago-2026 (ver next.config.ts,
// REDIRECTS_LEGACY_WORDPRESS) y a la fecha de este comentario todavía no está
// confirmado a qué URL quedó el WordPress/WooCommerce viejo (la cuenta de
// hosting es BanaHosting — ns8986/ns8987.banahosting.com son los nameservers
// de zplash.cl — hay que entrar a ese panel y confirmar/crear el subdominio
// correcto). Se lee de env para poder corregirlo sin deploy en cuanto se
// confirme, y para que si falta o queda mal, esta función (que corre en vivo
// desde /api/pagos/oneclick/inscripcion/retorno) reviente fuerte en vez de
// fallar en silencio (best-effort, ver comentario más abajo) dejando al
// cliente con doble cobro real: WooCommerce le sigue cobrando la tarjeta
// vieja porque nunca se canceló su suscripción allá.
function wcSiteUrl(): string {
  const url = process.env.WOOCOMMERCE_SITE_URL;
  if (!url) throw new Error("Falta WOOCOMMERCE_SITE_URL (URL actual del WordPress/WooCommerce — ya no es zplash.cl, ver comentario)");
  return url;
}

type SubscriptionWC = {
  id: number;
  status: string;
  billing?: Record<string, unknown>;
  meta_data?: Array<{ key?: string; value?: unknown }>;
};

// Misma extracción que scripts/backfill-renovacion-auto-woo.ts y
// /api/webhooks/woocommerce/shared.ts::extraerPatente — duplicada a
// propósito en vez de importada: ese shared.ts es local a las dos rutas de
// webhook, y este módulo (llamado desde /api/pagos/oneclick/inscripcion/
// retorno) no tiene motivo para acoplarse a él.
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

function authHeader(): string {
  const ck = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const cs = process.env.WOOCOMMERCE_CONSUMER_SECRET;
  if (!ck || !cs) throw new Error("Faltan WOOCOMMERCE_CONSUMER_KEY/WOOCOMMERCE_CONSUMER_SECRET");
  return "Basic " + Buffer.from(`${ck}:${cs}`).toString("base64");
}

// Mismo criterio de match que buscarClienteExistente (patente primero, email
// después) y misma forma de recorrer páginas que
// scripts/backfill-renovacion-auto-woo.ts::fetchSuscripcionesActivas — acá
// vive como función reutilizable porque además de ese script de una sola
// corrida, ahora también la llama en vivo /inscripcion/retorno.
async function buscarSuscripcionActiva(patente: string, email: string): Promise<SubscriptionWC | null> {
  const auth = authHeader();
  const perPage = 100;
  let page = 1;
  let totalPages = 1;
  do {
    const url = `${wcSiteUrl()}/wp-json/wc/v3/subscriptions?per_page=${perPage}&page=${page}&status=active`;
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`WooCommerce API ${res.status} buscando suscripciones activas: ${await res.text()}`);
    totalPages = Number(res.headers.get("X-WP-TotalPages")) || 1;
    const lote = (await res.json()) as SubscriptionWC[];
    const match = lote.find((s) => {
      if (patente && extraerPatente(s) === patente) return true;
      const billingEmail = String((s.billing || {}).email || "").trim().toLowerCase();
      return !!email && billingEmail === email;
    });
    if (match) return match;
    page++;
  } while (page <= totalPages);
  return null;
}

/**
 * Cancela en WooCommerce la suscripción activa de un cliente que acaba de
 * migrar su cobro automático al Oneclick propio de esta app (ver
 * /api/pagos/oneclick/inscripcion/retorno) — sin esto, WooCommerce
 * Subscriptions le sigue cobrando su próximo ciclo con la tarjeta vieja al
 * mismo tiempo que el cron nuevo (/api/pagos/oneclick/cobrar) cobra con la
 * tarjeta nueva: doble cobro real en la tarjeta del cliente.
 *
 * Requiere que WOOCOMMERCE_CONSUMER_KEY/SECRET tengan permiso de
 * Lectura/Escritura en WooCommerce — los scripts de migración
 * (scripts/migrar-historico-woocommerce.ts, scripts/backfill-renovacion-
 * auto-woo.ts) solo necesitaban lectura, así que si esas keys se generaron
 * para ese uso, hay que regenerarlas con el scope ampliado.
 *
 * Best-effort a propósito: se llama desde after() en el caller, después de
 * que la tarjeta nueva ya quedó guardada y la respuesta ya se le mandó al
 * cliente — si esto falla (permiso insuficiente, suscripción ya cancelada
 * allá, etc.) no debe revertir ni bloquear la inscripción, solo quedar
 * loggeado fuerte para revisión manual (ver caller).
 */
export async function cancelarSuscripcionWooCommerceLegacy(
  patente: string,
  email: string
): Promise<{ cancelada: boolean; subscriptionId?: number }> {
  const sub = await buscarSuscripcionActiva(normPlate(patente), (email || "").trim().toLowerCase());
  if (!sub) {
    console.warn(
      `No se encontró suscripción activa en WooCommerce para ${patente} / ${email} al migrar a Oneclick propio — nada que cancelar (puede que ya estuviera cancelada allá)`
    );
    return { cancelada: false };
  }

  const res = await fetch(`${wcSiteUrl()}/wp-json/wc/v3/subscriptions/${sub.id}`, {
    method: "PUT",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!res.ok) {
    throw new Error(`WooCommerce API ${res.status} cancelando suscripción #${sub.id}: ${await res.text()}`);
  }
  return { cancelada: true, subscriptionId: sub.id };
}
