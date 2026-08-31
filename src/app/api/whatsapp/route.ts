import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buscarOCrearConversacion, insertarMensaje, actualizarEstadoMensaje } from "@/lib/dataAccess";
import { uid } from "@/lib/helpers";
import { enviarPushAGerencia } from "@/lib/push/enviar";
import { rateLimited } from "@/lib/rateLimit";
import { enviarMensajeTexto } from "@/lib/whatsapp/enviar";
import { responderMensaje } from "@/lib/whatsapp/router";
import type { EstadoMensajeWhatsapp } from "@/types";

export const runtime = "nodejs";

const LIMITE_MENSAJES = 20;
const VENTANA_MS = 5 * 60 * 1000;

const ESTADO_META_A_LOCAL: Record<string, EstadoMensajeWhatsapp> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

type MetaMensaje = {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
};

type MetaStatus = {
  id: string;
  status: string;
  // Solo viene cuando status="failed". Sin esto el motivo se perdia y la fila
  // quedaba con estado="fallido" y `error` null — que es como quedaron los 36
  // destinatarios del rellamado del 8-ago-2026 que nunca recibieron el mensaje:
  // la Graph API acepto el envio (estado "enviado") y el fallo llego despues por aca.
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

// Mismo formato "(#code) mensaje" que ya guarda llamarGraphApi para los
// rechazos sincronicos (ver @/lib/whatsapp/enviar), asi los dos origenes se
// leen igual en el hilo de MensajesView.
function motivoDeStatus(status: MetaStatus): string | undefined {
  const e = status.errors?.[0];
  if (!e) return undefined;
  const texto = e.message || e.title || "Error sin detalle";
  return e.code ? `(#${e.code}) ${texto}` : texto;
}

type MetaContacto = {
  wa_id: string;
  profile?: { name?: string };
};

// Meta llama a GET una sola vez, al guardar la URL del webhook en Meta for
// Developers, para confirmar que somos dueños del endpoint.
export async function GET(request: NextRequest) {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("META_WEBHOOK_VERIFY_TOKEN no configurado");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (modo === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge);
  }
  return NextResponse.json({ error: "Token inválido" }, { status: 403 });
}

function firmaValida(rawBody: string, firma: string | null, secreto: string): boolean {
  if (!firma || !firma.startsWith("sha256=")) return false;
  const esperada = crypto.createHmac("sha256", secreto).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(esperada);
  const b = Buffer.from(firma.slice("sha256=".length));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function manejarMensajeEntrante(msg: MetaMensaje, nombreContacto: string | undefined) {
  const telefono = "+" + msg.from;

  if (rateLimited(`whatsapp:${telefono}`, LIMITE_MENSAJES, VENTANA_MS)) return;

  const conversacion = await buscarOCrearConversacion(telefono, nombreContacto);
  const textoEntrante = msg.type === "text" ? msg.text?.body || "" : "";
  await insertarMensaje({
    id: uid(),
    conversacionId: conversacion.id,
    direccion: "entrante",
    texto: textoEntrante || `[${msg.type}]`,
    tipo: "texto",
    whatsappMessageId: msg.id,
  });

  let respuesta;
  try {
    respuesta = await responderMensaje(textoEntrante, telefono, conversacion);
  } catch (error) {
    console.error("Error respondiendo mensaje de WhatsApp", error);
    respuesta = { texto: "Ocurrió un error de nuestro lado. Intenta de nuevo en unos minutos." };
  }

  if (respuesta.solicitaHumano) {
    const quien = nombreContacto || conversacion.nombreContacto || telefono;
    try {
      // Awaited (no fire-and-forget): en el runtime serverless de Vercel una
      // promesa suelta puede quedar cortada apenas la función responde, así
      // que hay que esperarla antes de seguir aunque no bloquee la
      // conversación si falla (VAPID sin configurar, Gerencia sin
      // suscripción activa, etc. — enviarPushAGerencia no lanza en esos
      // casos, solo devuelve false).
      await enviarPushAGerencia({
        title: "Piden hablar con una persona",
        body: `${quien} escribió por WhatsApp pidiendo hablar con alguien.`,
        url: "/",
      });
    } catch (error) {
      console.error("Error avisando a Gerencia por push", error);
    }
  }

  await enviarMensajeTexto(telefono, respuesta.texto);
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error("META_APP_SECRET no configurado");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }

  const rawBody = await request.text();
  const firma = request.headers.get("x-hub-signature-256");
  if (!firmaValida(rawBody, firma, appSecret)) {
    console.error("Firma inválida en webhook de Meta WhatsApp", { tieneFirma: !!firma });
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: {
    entry?: Array<{ changes?: Array<{ value?: { messages?: MetaMensaje[]; statuses?: MetaStatus[]; contacts?: MetaContacto[] } }> }>;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      const nombresPorWaId = new Map((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const msg of value.messages || []) {
        try {
          await manejarMensajeEntrante(msg, nombresPorWaId.get(msg.from));
        } catch (error) {
          console.error("Error procesando mensaje entrante de WhatsApp", error);
        }
      }

      for (const status of value.statuses || []) {
        const estado = ESTADO_META_A_LOCAL[status.status];
        if (estado) await actualizarEstadoMensaje(status.id, estado, estado === "fallido" ? motivoDeStatus(status) : undefined);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
