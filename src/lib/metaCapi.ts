// Conversions API de Meta: el mismo evento que manda el pixel desde el
// navegador, pero desde el servidor. Recupera lo que el pixel pierde
// (bloqueadores de anuncios, Safari/iOS, el form a Transbank que corta la
// página antes de que salga el request). Meta junta los dos por
// event_name + event_id, así que no se cuenta doble.
//
// Solo se llama desde /api/meta/evento, que a su vez solo lo llama el
// navegador cuando el visitante aceptó las cookies (ver @/lib/metaPixel).
// No se manda ningún dato personal: solo IP, navegador y las cookies _fbp/_fbc
// que el propio pixel deja (ver /privacidad).

import { PIXEL_ID } from "@/lib/metaPixelId";

const GRAPH = "https://graph.facebook.com/v21.0";

export type EventoMeta = {
  nombre: "Purchase" | "InitiateCheckout";
  eventId: string;
  url: string;
  ip: string;
  userAgent: string;
  fbp?: string;
  fbc?: string;
  valor?: number;
};

export async function enviarEventoMeta(e: EventoMeta): Promise<void> {
  // Mismo token de usuario de sistema que publica en Instagram (tiene
  // ads_management sobre el pixel). Sin él, solo queda el pixel del navegador.
  const token = process.env.META_ADS_TOKEN;
  if (!token) return;
  const userData: Record<string, string> = { client_user_agent: e.userAgent };
  if (e.ip && e.ip !== "desconocido") userData.client_ip_address = e.ip;
  if (e.fbp) userData.fbp = e.fbp;
  if (e.fbc) userData.fbc = e.fbc;
  const evento: Record<string, unknown> = {
    event_name: e.nombre,
    event_time: Math.floor(Date.now() / 1000),
    event_id: e.eventId,
    action_source: "website",
    event_source_url: e.url,
    user_data: userData,
  };
  if (e.valor !== undefined) evento.custom_data = { value: e.valor, currency: "CLP" };
  const body: Record<string, unknown> = { data: [evento] };
  // Para probar en el Administrador de eventos (pestaña "Probar eventos") sin
  // ensuciar los datos: se pone el código ahí en Vercel y se saca después.
  if (process.env.META_CAPI_TEST_CODE) body.test_event_code = process.env.META_CAPI_TEST_CODE;
  const res = await fetch(`${GRAPH}/${PIXEL_ID}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    // Si Meta se cuelga, no dejar la función abierta hasta el timeout de Vercel.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Conversions API respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
