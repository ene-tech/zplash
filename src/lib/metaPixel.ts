import { analiticaDisponible } from "@/lib/analitica";
import { PIXEL_ID } from "@/lib/metaPixelId";

// Pixel de Meta ("Píxel de Meta de Zplash", el mismo que ya tenía el WordPress
// viejo) para que las campañas de Facebook/Instagram sepan quién visitó la web
// y quién terminó pagando. Sigue las mismas reglas que PostHog (ver
// @/lib/analitica): solo en producción, nunca en el panel interno ni en un
// navegador marcado con ?no_medir=1, y solo después de que el visitante acepta
// las cookies. Antes de eso no se baja fbevents.js ni sale ningún request.
//
// El ID no es secreto (va en el HTML de cualquier sitio con pixel), por eso
// vive acá y no en una variable de entorno: analiticaDisponible() ya exige la
// clave de PostHog, que solo existe en Production de Vercel.
//
// Solo se manda el PageView de la página de entrada (ver disablePushState).

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let iniciado = false;
// Aceptó las cookies y no se arrepintió en esta visita. Lo que se manda por
// el servidor depende de esto, no de que window.fbq exista: fbq sigue
// definido después de un "consent revoke".
let consentido = false;

/** La URL puede llevar datos del cliente que Meta no debe recibir: la patente
 * (?patente=, ?ref=PATENTE) o el código del link SMS/Instagram (/v/CODIGO,
 * /ig/CODIGO, que sirve para pagar). En esas páginas el pixel del navegador
 * no se usa (fbevents.js manda la URL completa con cada evento). */
function urlConDatos(): boolean {
  const { pathname, search } = window.location;
  return /^\/(v|ig)\//.test(pathname) || /[?&](patente|ref)=/i.test(search);
}

/** URL para la Conversions API: sin query ni códigos de link. */
function urlLimpia(): string {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/^\/(v|ig)\/.*/, "/$1");
}

/** Carga el pixel y manda el PageView de esta página. Llamar solo con consentimiento. */
export function iniciarPixelMeta(): void {
  if (!analiticaDisponible()) return;
  consentido = true;
  // Entró por un link con patente o código: esta visita no carga el pixel
  // (las compras igual salen por el servidor, ver copiaServidor).
  if (!iniciado && urlConDatos()) return;
  try {
    if (iniciado && window.fbq) {
      // Había rechazado y volvió a aceptar en esta misma visita.
      window.fbq("consent", "grant");
      return;
    }
    if (!window.fbq) {
      // Snippet oficial de Meta, reescrito sin minificar: deja una cola que
      // fbevents.js vacía cuando termina de bajar.
      const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue.push(args);
      } as Fbq;
      fbq.queue = [];
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = "2.0";
      window.fbq = fbq;
      if (!window._fbq) window._fbq = fbq;
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
    }
    // Sin PageView automático en cada navegación interna: Next cambia la URL
    // sin recargar y esas URLs pueden llevar la patente (ver urlConDatos).
    // Basta el PageView de la página de entrada.
    (window.fbq as Fbq & { disablePushState?: boolean }).disablePushState = true;
    window.fbq("consent", "grant");
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
    iniciado = true;
  } catch (error) {
    console.error("No se pudo iniciar el pixel de Meta", error);
  }
}

/** Rechazó después de aceptar: el pixel deja de mandar eventos. */
export function detenerPixelMeta(): void {
  consentido = false;
  try {
    window.fbq?.("consent", "revoke");
  } catch (error) {
    console.error("No se pudo detener el pixel de Meta", error);
  }
}

/** Copia del evento al servidor (/api/meta/evento → Conversions API). Con
 * sendBeacon porque sale justo antes de irse a Transbank y un fetch normal se
 * cancelaría con la navegación. Mismo eventId que el pixel: Meta los junta. */
function copiaServidor(evento: "Purchase" | "InitiateCheckout", eventId: string): void {
  try {
    const cuerpo = JSON.stringify({ evento, eventId, url: urlLimpia() });
    const blob = new Blob([cuerpo], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/meta/evento", blob)) {
      void fetch("/api/meta/evento", { method: "POST", body: cuerpo, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  } catch (error) {
    console.error("No se pudo mandar el evento de Meta al servidor", error);
  }
}

/** Compra aprobada. `eventID` = buyOrder: Meta descarta el repetido si el
 * cliente recarga la página de resultado (y junta pixel con servidor). El
 * servidor vuelve a leer el monto de la base. Sin consentimiento no hace nada. */
export function trackCompraMeta(valor: number, buyOrder: string): void {
  if (!consentido) return;
  try {
    if (window.fbq && !urlConDatos()) window.fbq("track", "Purchase", { value: valor, currency: "CLP" }, { eventID: buyOrder });
  } catch (error) {
    console.error("No se pudo registrar la compra en el pixel de Meta", error);
  }
  copiaServidor("Purchase", buyOrder);
}

/** Se va a pagar a Transbank (Webpay, o inscripción Oneclick que cobra al
 * volver). Es el paso donde más gente se pierde y pasa varias veces más que
 * una compra: le da a Meta señal para optimizar aunque haya pocas ventas. */
export function trackInicioPagoMeta(): void {
  if (!consentido) return;
  const eventId = "ic" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  try {
    if (window.fbq && !urlConDatos()) window.fbq("track", "InitiateCheckout", {}, { eventID: eventId });
  } catch (error) {
    console.error("No se pudo registrar el inicio de pago en el pixel de Meta", error);
  }
  copiaServidor("InitiateCheckout", eventId);
}
