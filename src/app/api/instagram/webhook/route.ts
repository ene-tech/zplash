import crypto from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { atenderDmInstagram } from "@/lib/instagram/cuponSeguidor";
import { rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Webhook de mensajes directos de Instagram (campo "messages" del objeto
// "instagram" en la app de Meta). Hoy solo atiende el descuento por seguirnos:
// quien responde ZPLASH a una historia (o lo escribe por DM) recibe su link
// (ver @/lib/instagram/cuponSeguidor). El resto de los DM no se toca.
//
// Mismo secreto y token de verificación que el webhook de WhatsApp, salvo que
// se configuren los propios de Instagram.

export async function GET(request: NextRequest) {
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) return NextResponse.json({ error: "No configurado" }, { status: 500 });
  const params = request.nextUrl.searchParams;
  const challenge = params.get("hub.challenge");
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === verifyToken && challenge) {
    return new NextResponse(challenge);
  }
  return NextResponse.json({ error: "Token inválido" }, { status: 403 });
}

function firmaValida(rawBody: string, firma: string | null, secreto: string): boolean {
  if (!firma || !firma.startsWith("sha256=")) return false;
  const esperada = Buffer.from(crypto.createHmac("sha256", secreto).update(rawBody, "utf8").digest("hex"));
  const recibida = Buffer.from(firma.slice("sha256=".length));
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

type EventoMensaje = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
};

export async function POST(request: NextRequest) {
  const secreto = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  if (!secreto) {
    console.error("Falta INSTAGRAM_APP_SECRET / META_APP_SECRET");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }
  const rawBody = await request.text();
  // Rastro en rate_limits (los logs de Vercel no se leen desde el repo): deja
  // ver con scripts/q.mts si Meta manda eventos y si la firma calza.
  const rastro = (que: string) => rateLimited(`instagram-webhook:${que}`, 1_000_000, 30 * 24 * 60 * 60 * 1000).catch(() => false);
  if (!firmaValida(rawBody, request.headers.get("x-hub-signature-256"), secreto)) {
    await rastro("firma-mala");
    console.error("Firma inválida en webhook de Instagram");
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: { object?: string; entry?: Array<{ id?: string; messaging?: EventoMensaje[] }> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  await rastro(`objeto-${payload.object ?? "ninguno"}`);
  if (payload.object !== "instagram") return NextResponse.json({ ok: true });

  for (const entry of payload.entry || []) {
    for (const evento of entry.messaging || []) {
      const igId = evento.sender?.id;
      const texto = evento.message?.text;
      // Los nuestros vuelven como eco; sin texto (fotos, reacciones) no hay nada que leer.
      if (!igId || !texto || evento.message?.is_echo || igId === entry.id) continue;
      // Meta reenvía el mismo evento si no recibió el 200 a tiempo: una sola
      // respuesta por mensaje.
      const mid = evento.message?.mid;
      if (mid && (await rateLimited(`instagram-mid:${mid}`, 1, 24 * 60 * 60 * 1000))) continue;
      // Después de responderle a Meta: consulta el perfil y manda el DM, y
      // Meta reintenta si no recibe el 200 a tiempo.
      after(() => atenderDmInstagram(igId, texto).catch((error) => console.error("Error atendiendo DM de Instagram", igId, error)));
    }
  }
  return NextResponse.json({ ok: true });
}
