import posthog from "posthog-js";

// Analítica de producto (PostHog: embudos, grabaciones de sesión, mapas de
// calor) solo para el sitio público, y solo después de que el visitante la
// acepta en el aviso de cookies (AvisoCookies). Hasta entonces PostHog ni
// siquiera se inicializa: no hay requests ni cookies/localStorage de PostHog,
// ni la primera visita. Se eligió no inicializar en vez de
// opt_out_capturing_by_default porque así no queda ninguna duda de que nada
// sale antes de aceptar (el init igual pide la configuración remota).
//
// La clave existe únicamente en el ambiente Production de Vercel: en local,
// en dev:pruebas y en previews no se carga nada y no se mezclan visitas de
// prueba con las reales (y tampoco se muestra el aviso: no hay qué aceptar).
//
// El panel interno (admin.zplash.cl, que por dentro es /admin, y el operador
// que vive ahí) queda fuera: ensucia los embudos y grabaría datos de
// clientes en pantalla.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** localStorage: "aceptado" | "rechazado". Sin valor = todavía no decide. */
export const CLAVE_CONSENTIMIENTO = "zplash_cookies";
/** Evento para que el link "Preferencias de cookies" vuelva a abrir el aviso. */
export const EVENTO_PREFERENCIAS_COOKIES = "zplash:preferencias-cookies";

export type Consentimiento = "aceptado" | "rechazado";

export function esPanelInterno(): boolean {
  return window.location.hostname.startsWith("admin.") || window.location.pathname.startsWith("/admin");
}

// Para que el dueño mire la web sin contarse como cliente: entrar una vez a
// zplash.cl/?no_medir=1 marca ese navegador para siempre (?no_medir=0 lo
// desmarca). Ese navegador tampoco ve el aviso de cookies.
function navegadorExcluido(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get("no_medir");
    if (param === "1") localStorage.setItem("zplash_no_medir", "1");
    if (param === "0") localStorage.removeItem("zplash_no_medir");
    return localStorage.getItem("zplash_no_medir") === "1";
  } catch {
    return false;
  }
}

/** Hay analítica que pedir permiso para usar en esta página y navegador. */
export function analiticaDisponible(): boolean {
  return !!KEY && !esPanelInterno() && !navegadorExcluido();
}

export function leerConsentimiento(): Consentimiento | null {
  try {
    const v = localStorage.getItem(CLAVE_CONSENTIMIENTO);
    return v === "aceptado" || v === "rechazado" ? v : null;
  } catch {
    return null;
  }
}

/** Guarda la decisión y prende o apaga PostHog en el momento, sin recargar. */
export function guardarConsentimiento(valor: Consentimiento): void {
  try {
    localStorage.setItem(CLAVE_CONSENTIMIENTO, valor);
  } catch {
    // Storage bloqueado: la decisión vale solo para esta visita.
  }
  if (valor === "aceptado") iniciarAnalitica();
  else detenerAnalitica();
}

/** Inicializa PostHog si hay analítica disponible y todavía no está cargado. */
export function iniciarAnalitica(): void {
  if (!KEY || !analiticaDisponible()) return;
  try {
    if (posthog.__loaded) {
      // Había rechazado después de aceptar en esta misma visita.
      posthog.opt_in_capturing();
      return;
    }
    posthog.init(KEY, {
      api_host: "https://eu.i.posthog.com",
      defaults: "2026-08-30",
      person_profiles: "identified_only",
      // Si alguna vez rechazó después de aceptar, PostHog guardó su propio
      // opt-out; ahora que volvió a aceptar hay que levantarlo o no capturaría.
      loaded: (ph) => {
        if (ph.has_opted_out_capturing()) ph.opt_in_capturing();
      },
      session_recording: {
        // Los inputs ya van enmascarados por defecto (patente, correo,
        // teléfono). En Mi Cuenta además se ve el correo/teléfono como texto
        // plano, así que bajo /cliente se enmascara todo el texto.
        maskAllInputs: true,
        maskTextSelector: "*",
        maskTextFn: (text) => (window.location.pathname.startsWith("/cliente") ? text.replace(/\S/g, "*") : text),
      },
    });
  } catch (error) {
    console.error("No se pudo iniciar PostHog", error);
  }
}

/** Rechazó (o cambió de opinión): deja de capturar y de grabar. */
export function detenerAnalitica(): void {
  try {
    if (posthog.__loaded) posthog.opt_out_capturing();
  } catch (error) {
    console.error("No se pudo detener PostHog", error);
  }
}
