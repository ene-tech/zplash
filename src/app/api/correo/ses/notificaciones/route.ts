import { NextResponse } from "next/server";
import { suprimirCorreos } from "@/lib/dataAccess/correosSuprimidos";
import { emailValido, normalizarEmail } from "@/lib/mailing/direcciones";
import { esUrlDeSns, extraerSupresiones, parsearMensajeSns, regionDeTopicArn, verificarFirmaSns } from "@/lib/mailing/snsFirma";

// Webhook de Amazon SNS para los eventos de SES (rebotes y quejas), ver
// docs/migracion-ses.md. Público (sin sesión, como /api/webhooks/*): la
// autenticación es la firma de SNS, verificada con el certificado de
// sns.<región>.amazonaws.com (ver @/lib/mailing/snsFirma), más el TopicArn
// que tiene que ser exactamente AWS_SES_SNS_TOPIC_ARN.
//
// Orden de los chequeos, del más barato al más caro: tamaño, forma del JSON,
// TopicArn y recién ahí la firma (que puede bajar un certificado). Así un
// POST basura no le hace a este endpoint pegarle a AWS.

export const runtime = "nodejs";

const MAX_BYTES = 256 * 1024; // SNS manda como máximo 256 KB

export async function POST(request: Request) {
  const topicEsperado = process.env.AWS_SES_SNS_TOPIC_ARN;
  if (!topicEsperado) {
    console.error("AWS_SES_SNS_TOPIC_ARN no configurado: se ignora la notificación SNS");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }

  const largo = Number(request.headers.get("content-length") || 0);
  if (largo > MAX_BYTES) return NextResponse.json({ error: "Demasiado grande" }, { status: 413 });
  const texto = await request.text();
  if (texto.length > MAX_BYTES) return NextResponse.json({ error: "Demasiado grande" }, { status: 413 });

  let dato: unknown;
  try {
    dato = JSON.parse(texto);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const mensaje = parsearMensajeSns(dato);
  if (!mensaje) return NextResponse.json({ error: "No es un mensaje SNS" }, { status: 400 });
  if (mensaje.TopicArn !== topicEsperado) {
    console.error("Notificación SNS de un topic que no es el configurado, ignorada", mensaje.TopicArn);
    return NextResponse.json({ error: "Topic no autorizado" }, { status: 403 });
  }
  if (!(await verificarFirmaSns(mensaje))) {
    console.error("Notificación SNS con firma inválida, ignorada", mensaje.MessageId);
    return NextResponse.json({ error: "Firma inválida" }, { status: 403 });
  }

  if (mensaje.Type === "SubscriptionConfirmation") {
    // Firma ya verificada; igual se valida el host antes de visitarlo.
    const region = regionDeTopicArn(mensaje.TopicArn);
    if (!region || !mensaje.SubscribeURL || !esUrlDeSns(mensaje.SubscribeURL, region)) {
      return NextResponse.json({ error: "SubscribeURL inválida" }, { status: 400 });
    }
    try {
      const res = await fetch(mensaje.SubscribeURL, { redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log("Suscripción SNS de SES confirmada", mensaje.TopicArn);
      return NextResponse.json({ ok: true, confirmada: true });
    } catch (error) {
      console.error("No se pudo confirmar la suscripción SNS", error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "No se pudo confirmar" }, { status: 502 });
    }
  }

  if (mensaje.Type === "UnsubscribeConfirmation") {
    console.error("SNS avisa que se dio de baja la suscripción de rebotes/quejas de SES", mensaje.TopicArn);
    return NextResponse.json({ ok: true });
  }

  if (mensaje.Type !== "Notification") return NextResponse.json({ ok: true, ignorado: true });

  let eventoSes: unknown;
  try {
    eventoSes = JSON.parse(mensaje.Message);
  } catch {
    // Mensajes de prueba de la consola de SNS ("Publish message") traen texto plano.
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const filas = extraerSupresiones(eventoSes)
    .map((s) => ({ ...s, email: normalizarEmail(s.email) }))
    .filter((s) => emailValido(s.email));
  if (!filas.length) return NextResponse.json({ ok: true, suprimidos: 0 });

  try {
    await suprimirCorreos(filas);
  } catch (error) {
    // 500 => SNS reintenta (por ejemplo, si todavía no se pegó el SQL de la tabla).
    console.error("No se pudo guardar en correos_suprimidos", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
  // Sin loguear las direcciones completas: solo cuántas y por qué.
  console.log("SES: direcciones suprimidas", filas.length, filas.map((f) => f.motivo).join(","));
  return NextResponse.json({ ok: true, suprimidos: filas.length });
}
