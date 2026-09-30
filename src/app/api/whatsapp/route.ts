import { after, NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buscarOCrearConversacion, insertarMensaje, actualizarEstadoMensaje, humanoAtendiendo, recibioPlantillaReciente } from "@/lib/dataAccess";
import { ENVIADO_POR_AGENTE, opcionDeTexto, uid } from "@/lib/helpers";
import { enviarPushAGerencia } from "@/lib/push/enviar";
import { rateLimited } from "@/lib/rateLimit";
import { enviarMensajeTexto } from "@/lib/whatsapp/enviar";
import { claveAnthropic, responderConAgente } from "@/lib/whatsapp/agente";
import { responderMensaje } from "@/lib/whatsapp/router";
import type { EstadoMensajeWhatsapp } from "@/types";

export const runtime = "nodejs";
// El agente con IA tarda unos segundos por mensaje y corre en after(), que
// vive dentro de este límite (ver responderConAgente).
export const maxDuration = 120;

// Qué conversaciones atiende el agente con IA en vez del menú:
// AGENTE_WHATSAPP="todos", "mitad" (teléfonos que terminan en número impar, para
// comparar la tasa de cierre contra el menú con la otra mitad) o sin definir
// = apagado. Sin ANTHROPIC_API_KEY queda apagado igual.
function atiendeElAgente(telefono: string): boolean {
  // Tolerante a comillas, espacios y mayúsculas: el valor se pega a mano en
  // Vercel, y un `"mitad"` con comillas lo dejaba apagado sin ningún aviso.
  const modo = (process.env.AGENTE_WHATSAPP || "").replace(/["'`\s]/g, "").toLowerCase();
  const clave = claveAnthropic();
  const conClave = clave.length > 0;
  const atiende = conClave && (modo === "todos" || (modo === "mitad" && Number(telefono.at(-1)) % 2 === 1));
  // Sin la clave ni el teléfono: solo lo necesario para ver en los Runtime
  // Logs de Vercel por qué un mensaje fue (o no) al agente.
  if (modo) console.info("[agente-whatsapp]", { modo, atiende, largoClave: clave.length, formatoClave: clave.startsWith("sk-ant-api") });
  return atiende;
}

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

  // Un pulgar arriba o un sticker no es una pregunta: contestarlos disparaba
  // el menú completo de vuelta (19 reacciones y 5 stickers entre jun y ago
  // 2026, porque msg.text llega vacío y el router lee vacío como "mostrar el
  // menú"). Quedan igual guardados arriba, para que Gerencia los vea en el
  // hilo. Fotos y audios SÍ siguen recibiendo el menú: ahí hay alguien
  // tratando de decir algo y quedarse callado es peor.
  if (msg.type === "reaction" || msg.type === "sticker") return;

  // Alguien del equipo está contestando a mano: el bot no se mete. El
  // mensaje ya quedó guardado arriba y suma a noLeidos en el inbox. Si igual
  // pide una persona, el push a Gerencia sale (sin respuesta del bot).
  if (await humanoAtendiendo(conversacion.id)) {
    if (opcionDeTexto(textoEntrante) === "humano") await avisarGerencia(nombreContacto || conversacion.nombreContacto || telefono, conversacion.id);
    return;
  }

  // La opinión del QR del túnel guarda una nota paso a paso: esa y cualquier
  // flujo con estado ya empezado se quedan en el bot de siempre.
  if (atiendeElAgente(telefono) && !conversacion.flowState && opcionDeTexto(textoEntrante) !== "opinion") {
    let agente;
    try {
      agente = await responderConAgente(conversacion, telefono);
    } catch (error) {
      // Sin respuesta del agente (API caída, plazo, rechazo): contesta el menú.
      console.error("Agente WhatsApp falló, responde el bot de siempre", error);
    }
    // Fuera del try: si falla el registro de un mensaje ya enviado, no hay
    // que mandarle además el menú al cliente.
    if (agente) {
      const quien = nombreContacto || conversacion.nombreContacto || telefono;
      if (agente.derivar) await avisarGerencia(quien, conversacion.id, { title: "El asistente derivó un chat", body: `${quien}: ${agente.derivar}` });
      if (agente.texto) await enviarMensajeTexto(telefono, agente.texto, ENVIADO_POR_AGENTE);
      return;
    }
  }

  let respuesta;
  try {
    respuesta = await responderMensaje(textoEntrante, telefono, conversacion);
  } catch (error) {
    console.error("Error respondiendo mensaje de WhatsApp", error);
    respuesta = { texto: "Ocurrió un error de nuestro lado. Intenta de nuevo en unos minutos." };
  }

  // El router devuelve null cuando no hay nada que decir (un emoji suelto, un
  // "gracias"). El mensaje del cliente ya quedó guardado arriba.
  if (!respuesta) return;

  const quien = nombreContacto || conversacion.nombreContacto || telefono;
  if (respuesta.solicitaHumano) await avisarGerencia(quien, conversacion.id);
  // Contesta a una campaña o regla con algo que el bot no entiende: el menú
  // sale igual, pero alguien tiene que ver la pregunta de verdad.
  else if (respuesta.noEntendido && textoEntrante && (await recibioPlantillaReciente(conversacion.id)))
    await avisarGerencia(quien, conversacion.id, {
      title: "Respondieron a una campaña",
      body: `${quien}: "${textoEntrante.slice(0, 120)}"`,
    });

  await enviarMensajeTexto(telefono, respuesta.texto);
}

async function avisarGerencia(
  quien: string,
  conversacionId: string,
  texto = { title: "Piden hablar con una persona", body: `${quien} escribió por WhatsApp pidiendo hablar con alguien.` }
) {
  try {
    // Awaited (no fire-and-forget): en el runtime serverless de Vercel una
    // promesa suelta puede quedar cortada apenas la función responde, así
    // que hay que esperarla antes de seguir aunque no bloquee la
    // conversación si falla (VAPID sin configurar, Gerencia sin
    // suscripción activa, etc. — enviarPushAGerencia no lanza en esos
    // casos, solo devuelve false).
    await enviarPushAGerencia({
      ...texto,
      // Decía "/", que es la landing pública: tocar la notificación dejaba a
      // Gerencia en la web de clientes, con el panel a varios pasos de
      // distancia. El panel vive en /admin, y el parámetro abre derecho el
      // hilo de quien escribió (lo traduce a la vista AppProvider, ver
      // @/context/AppContext) — hay 24h de ventana de Meta para contestar
      // gratis, así que cada clic de más cuenta.
      url: `/admin?conversacion=${conversacionId}`,
    });
  } catch (error) {
    console.error("Error avisando a Gerencia por push", error);
  }
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
        const procesar = async () => {
          try {
            await manejarMensajeEntrante(msg, nombresPorWaId.get(msg.from));
          } catch (error) {
            console.error("Error procesando mensaje entrante de WhatsApp", error);
          }
        };
        // Si lo atiende el agente, después de responderle a Meta: tarda
        // segundos y Meta reintenta el webhook si no recibe el 200 a tiempo.
        // El menú sigue siendo síncrono, como siempre.
        if (atiendeElAgente("+" + msg.from)) after(procesar);
        else await procesar();
      }

      for (const status of value.statuses || []) {
        const estado = ESTADO_META_A_LOCAL[status.status];
        if (estado) await actualizarEstadoMensaje(status.id, estado, estado === "fallido" ? motivoDeStatus(status) : undefined);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
