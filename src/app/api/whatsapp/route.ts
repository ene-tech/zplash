import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { responderMensaje } from "@/lib/whatsapp/router";
import { rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_MENSAJES = 20;
const VENTANA_MS = 5 * 60 * 1000;

function xmlEscape(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("TWILIO_AUTH_TOKEN no configurado");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const firma = request.headers.get("x-twilio-signature");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const url = `${proto}://${host}${request.nextUrl.pathname}`;
  const firmaValida = !!firma && twilio.validateRequest(authToken, firma, url, params);
  if (!firmaValida) {
    console.error("Firma inválida en webhook de Twilio WhatsApp", { url, tieneFirma: !!firma });
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const remitente = params.From || "desconocido";
  if (rateLimited(`whatsapp:${remitente}`, LIMITE_MENSAJES, VENTANA_MS)) {
    const twiml =
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>Estás mandando mensajes muy seguido, espera unos minutos e intenta de nuevo.</Body></Message></Response>';
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  const cuerpoMensaje = params.Body || "";
  let texto: string;
  let mediaPath: string | undefined;
  try {
    ({ texto, mediaPath } = await responderMensaje(cuerpoMensaje));
  } catch (error) {
    console.error("Error respondiendo mensaje de WhatsApp", error);
    texto = "Ocurrió un error de nuestro lado. Intenta de nuevo en unos minutos.";
  }

  const media = mediaPath ? `<Media>${xmlEscape(`${proto}://${host}${mediaPath}`)}</Media>` : "";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${xmlEscape(texto)}</Body>${media}</Message></Response>`;
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
