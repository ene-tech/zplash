import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import { normPlate } from "@/lib/helpers";
import type { Cliente } from "@/types";

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
//
// La patente MANDA sobre el email, y por eso se recorren TODAS las páginas
// antes de decidir: antes se devolvía la primera suscripción del lote que
// calzara por patente O por email, así que a un cliente con dos autos bajo el
// mismo correo (los hay) le cancelaba el auto equivocado cuando esa otra venía
// antes. Por lo mismo se devuelven todas las que calcen: dos suscripciones
// activas para la misma patente son dos cobros al mismo auto (ya pasó, ver
// wooLimpieza.ts) y cortar una sola deja la otra cobrando.
//
// `email` es el respaldo para las suscripciones que arrastran la patente vieja
// (ver wooLimpieza.ts) y el caller decide si mandarlo — pasarlo siempre le
// cancelaría al cliente la suscripción de OTRO de sus autos. Con 2+ bajo el
// mismo correo y ninguna con la patente pedida se LANZA en vez de devolver
// vacío: "no sé cuál es" no es lo mismo que "no hay ninguna", y esa diferencia
// es la que decide si al cliente se le manda el correo diciéndole que ya no se
// le cobra.
//
// El deadline es para todas las páginas juntas: WordPress se demora varios
// segundos por página y esto se espera dentro de requests de cara al cliente.
// Sin él, un WordPress lento no da error, se lleva la función entera por
// delante.
async function buscarSuscripcionesActivas(patente: string, email: string): Promise<SubscriptionWC[]> {
  const auth = authHeader();
  const signal = AbortSignal.timeout(15000);
  const perPage = 100;
  const todas: SubscriptionWC[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = `${wcSiteUrl()}/wp-json/wc/v3/subscriptions?per_page=${perPage}&page=${page}&status=active`;
    const res = await fetch(url, { headers: { Authorization: auth }, signal });
    if (!res.ok) throw new Error(`WooCommerce API ${res.status} buscando suscripciones activas: ${await res.text()}`);
    totalPages = Number(res.headers.get("X-WP-TotalPages")) || 1;
    todas.push(...((await res.json()) as SubscriptionWC[]));
    page++;
  } while (page <= totalPages);

  const porPatente = patente ? todas.filter((s) => extraerPatente(s) === patente) : [];
  if (porPatente.length) return porPatente;

  const porEmail = email ? todas.filter((s) => String((s.billing || {}).email || "").trim().toLowerCase() === email) : [];
  if (porEmail.length > 1) {
    throw new Error(
      `${email} tiene ${porEmail.length} suscripciones activas en WooCommerce y ninguna trae la patente ${patente} — cancelar "la primera" le cortaría el auto equivocado, hay que revisarlo a mano: ${porEmail.map((s) => "#" + s.id).join(", ")}`
    );
  }
  return porEmail;
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
 * Lanza si WooCommerce rechaza el corte: es plata, y el caller tiene que poder
 * distinguir "no había nada que cancelar" de "no se pudo". Quien no quiera
 * lidiar con eso usa cortarCobroWooCommerceLegacy, que nunca lanza.
 */
export async function cancelarSuscripcionWooCommerceLegacy(
  patente: string,
  email: string
): Promise<{ cancelada: boolean; ids: number[] }> {
  const subs = await buscarSuscripcionesActivas(normPlate(patente), (email || "").trim().toLowerCase());
  if (!subs.length) {
    console.warn(
      `No se encontró suscripción activa en WooCommerce para ${patente} / ${email} — nada que cancelar (puede que ya estuviera cancelada allá)`
    );
    return { cancelada: false, ids: [] };
  }

  for (const sub of subs) {
    const res = await fetch(`${wcSiteUrl()}/wp-json/wc/v3/subscriptions/${sub.id}`, {
      method: "PUT",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!res.ok) {
      throw new Error(`WooCommerce API ${res.status} cancelando suscripción #${sub.id}: ${await res.text()}`);
    }
  }
  return { cancelada: true, ids: subs.map((s) => s.id) };
}

/**
 * Qué pasó con el cobro viejo. "sin_suscripcion" y "cancelada" son las dos
 * formas de quedar tranquilo (no hay nada cobrando por allá); "error" es la
 * única que obliga a avisar: puede que WooCommerce le cobre igual el próximo
 * ciclo, así que ni la ficha puede decir que quedó cancelado ni al cliente se
 * le puede mandar el correo de respaldo diciéndole que ya no se le cobra.
 */
export type CorteWooCommerce = "cancelada" | "sin_suscripcion" | "error";

/**
 * Corta el cobro viejo de WooCommerce de una patente que ya no debe cobrarse
 * por allá y limpia `renovacionAutoWooDesde`. Mientras esa suscripción siga
 * viva, WooCommerce le cobra su próximo ciclo con la tarjeta anterior — al
 * mismo tiempo que el cron nuevo cobra con la inscrita, o después de que se le
 * terminó el plan sin tope.
 *
 * Le pregunta a WooCommerce SIEMPRE, sin usar `renovacionAutoWooDesde` como
 * permiso para preguntar: esa marca se pone cuando llega el webhook de un
 * pedido de renovación pagado y se limpia con el de cancelación, así que una
 * suscripción reactivada a mano en Woo (pasó con las 88 del rescate del
 * 31-ago-2026) queda cobrando con la marca en null — y con el atajo puesto,
 * esos clientes eran justo los que nunca se cancelaban. La marca quedó como lo
 * que es: evidencia de que ESTA patente estuvo en Woo. Por eso decide dos
 * cosas y ninguna más:
 *  - si se puede buscar por email (el respaldo para las suscripciones que
 *    arrastran la patente vieja). Sin esa evidencia, buscar por email le
 *    cancelaría al cliente la suscripción de otro de sus autos.
 *  - si un "error" es grave para el caller: sin marca, lo más probable es que
 *    el cliente nunca haya estado en Woo y el corte sobre, así que un
 *    WooCommerce caído no puede bloquearle la baja de su tarjeta.
 *
 * Nunca lanza: devuelve el estado del corte y lo deja loggeado fuerte. `motivo`
 * va al log, que es lo único que distingue los casos que cortan el cobro.
 */
export async function cortarCobroWooCommerceLegacy(
  cliente: Pick<Cliente, "id" | "email" | "renovacionAutoWooDesde"> | null | undefined,
  patente: string,
  motivo: string
): Promise<CorteWooCommerce> {
  if (!cliente) return "sin_suscripcion";
  try {
    const { cancelada, ids } = await cancelarSuscripcionWooCommerceLegacy(
      patente,
      cliente.renovacionAutoWooDesde ? cliente.email || "" : ""
    );
    if (cancelada) console.log(`Suscripción WooCommerce ${ids.map((id) => "#" + id).join(", ")} cancelada: ${patente} — ${motivo}`);
    // La marca se limpia también cuando no había nada que cancelar: si Woo dice
    // que esa patente no tiene suscripción activa, dejarla puesta la seguiría
    // mostrando como "RA WOO" en la ficha, le seguiría diciendo al cliente en
    // Mi Cuenta que su renovación la maneja el sistema anterior, y la dejaría
    // fuera de los avisos de vencimiento (ver reglas/cron) para siempre.
    if (cliente.renovacionAutoWooDesde) {
      await getDb().update(clientes).set({ renovacionAutoWooDesde: null }).where(eq(clientes.id, cliente.id));
    }
    return cancelada ? "cancelada" : "sin_suscripcion";
  } catch (error) {
    console.error(`ERROR cancelando la suscripción de WooCommerce de ${patente} (${motivo}) — revisar a mano`, error);
    return "error";
  }
}

/**
 * cortarCobroWooCommerceLegacy en segundo plano, para los caminos que le
 * están respondiendo a alguien y no pueden esperar a WooCommerce.
 *
 * La llaman TODOS los caminos que dejan una patente con Oneclick propio:
 * /api/pagos/oneclick/inscripcion/retorno (inscribió tarjeta) y
 * /api/cliente/mi-cuenta/compartir-tarjeta ("Usar en mis otros autos", que
 * activa el cobro sin pasar por Transbank y por eso es fácil de olvidar).
 */
export function migrarDeWooCommerceLegacy(
  cliente: Pick<Cliente, "id" | "email" | "renovacionAutoWooDesde"> | null | undefined,
  patente: string
): void {
  if (!cliente) return;
  after(() => cortarCobroWooCommerceLegacy(cliente, patente, "migró a Oneclick propio"));
}
