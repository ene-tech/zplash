import "server-only";

import { buscarOCrearConversacion, insertarMensaje } from "@/lib/dataAccess";
import { uid } from "@/lib/helpers";
import type { EstadoMensajeWhatsapp, MensajeWhatsapp, TipoMensajeWhatsapp } from "@/types";

const GRAPH_API_VERSION = "v25.0";

function urlMensajes(): string {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("Falta META_WHATSAPP_PHONE_NUMBER_ID en las variables de entorno");
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
}

async function llamarGraphApi(body: Record<string, unknown>): Promise<{ ok: boolean; wamid?: string; error?: string }> {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: "Falta META_WHATSAPP_TOKEN en las variables de entorno" };

  try {
    const res = await fetch(urlMensajes(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Error enviando mensaje WhatsApp (Graph API)", data);
      return { ok: false, error: data?.error?.message || "Error desconocido de Graph API" };
    }
    return { ok: true, wamid: data?.messages?.[0]?.id };
  } catch (error) {
    console.error("Error de red enviando mensaje WhatsApp", error);
    return { ok: false, error: "Error de red" };
  }
}

// Registra el resultado del envío (éxito o fallo) como fila saliente en
// mensajes_whatsapp, sea cual sea el resultado, para que el hilo en
// MensajesView muestre también los intentos fallidos.
async function registrarSalida(
  telefono: string,
  texto: string,
  tipo: TipoMensajeWhatsapp,
  resultado: { ok: boolean; wamid?: string; error?: string },
  enviadoPor?: string
): Promise<MensajeWhatsapp> {
  const conversacion = await buscarOCrearConversacion(telefono);
  const estado: EstadoMensajeWhatsapp = resultado.ok ? "enviado" : "fallido";
  return insertarMensaje({
    id: uid(),
    conversacionId: conversacion.id,
    direccion: "saliente",
    texto,
    tipo,
    estado,
    whatsappMessageId: resultado.wamid,
    enviadoPor,
    error: resultado.error,
  });
}

// Mensaje de texto libre — solo válido dentro de la ventana de 24h desde el
// último mensaje entrante del cliente (regla de Meta); fuera de esa ventana
// la Graph API rechaza el envío y hay que usar una plantilla en su lugar
// (ver enviarMensajePlantilla).
export async function enviarMensajeTexto(telefono: string, texto: string, enviadoPor?: string): Promise<MensajeWhatsapp> {
  const resultado = await llamarGraphApi({ to: telefono, type: "text", text: { body: texto } });
  return registrarSalida(telefono, texto, "texto", resultado, enviadoPor);
}

// Mensaje iniciado por el negocio usando una plantilla pre-aprobada en Meta
// Business Manager (no se gestionan plantillas desde esta app). `parametros`
// son los valores posicionales de las variables {{1}}, {{2}}, ... del cuerpo
// de la plantilla. `codigoBotonUrl` es solo para plantillas de categoría
// Authentication con botón "Copiar código" (ej. mensaje_otp): Meta lo
// implementa como un botón tipo URL cuyo sufijo dinámico es el código, y sin
// ese parámetro la Graph API rechaza el envío con "(#131008) buttons: Button
// at index 0 of type Url requires a parameter" — no confundir con las
// plantillas normales del motor de reglas, que no llevan botón.
export async function enviarMensajePlantilla(
  telefono: string,
  nombrePlantilla: string,
  idioma: string,
  parametros?: string[],
  enviadoPor?: string,
  codigoBotonUrl?: string
): Promise<MensajeWhatsapp> {
  const components: Record<string, unknown>[] = [];
  if (parametros?.length) {
    components.push({ type: "body", parameters: parametros.map((p) => ({ type: "text", text: p })) });
  }
  if (codigoBotonUrl) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: codigoBotonUrl }] });
  }
  const resultado = await llamarGraphApi({
    to: telefono,
    type: "template",
    template: { name: nombrePlantilla, language: { code: idioma }, components: components.length ? components : undefined },
  });
  return registrarSalida(telefono, `[Plantilla: ${nombrePlantilla}]`, "plantilla", resultado, enviadoPor);
}
