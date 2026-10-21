import { X509Certificate, verify, type KeyObject } from "node:crypto";

// Verificación de mensajes de Amazon SNS (rebotes y quejas de SES, ver
// src/app/api/correo/ses/notificaciones/route.ts). El webhook es público, así
// que sin esto cualquiera podría meter direcciones a la lista de supresión y
// cortarle el correo a un cliente. Algoritmo según la doc de SNS
// ("Verifying the signatures of Amazon SNS messages"):
//
//  1. El certificado se baja SOLO de https://sns.<región del TopicArn>.amazonaws.com/...pem
//     (nada de seguir lo que diga SigningCertURL a cualquier host).
//  2. Se arma el string a firmar con campos fijos según el Type.
//  3. SignatureVersion "1" = RSA-SHA1, "2" = RSA-SHA256. Otro valor: rechazo.

export interface MensajeSns {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  Token?: string;
  SubscribeURL?: string;
}

const CAMPOS_OBLIGATORIOS = ["Type", "MessageId", "TopicArn", "Message", "Timestamp", "SignatureVersion", "Signature", "SigningCertURL"] as const;

/** Valida la forma del JSON que manda SNS. `null` si no es un mensaje SNS. */
export function parsearMensajeSns(dato: unknown): MensajeSns | null {
  if (!dato || typeof dato !== "object") return null;
  const o = dato as Record<string, unknown>;
  for (const k of CAMPOS_OBLIGATORIOS) if (typeof o[k] !== "string") return null;
  for (const k of ["Subject", "Token", "SubscribeURL"]) if (o[k] !== undefined && o[k] !== null && typeof o[k] !== "string") return null;
  return {
    Type: o.Type as string,
    MessageId: o.MessageId as string,
    TopicArn: o.TopicArn as string,
    Message: o.Message as string,
    Timestamp: o.Timestamp as string,
    SignatureVersion: o.SignatureVersion as string,
    Signature: o.Signature as string,
    SigningCertURL: o.SigningCertURL as string,
    Subject: typeof o.Subject === "string" ? o.Subject : undefined,
    Token: typeof o.Token === "string" ? o.Token : undefined,
    SubscribeURL: typeof o.SubscribeURL === "string" ? o.SubscribeURL : undefined,
  };
}

/** Región de un ARN de SNS ("arn:aws:sns:us-east-1:123:topic" -> "us-east-1"). */
export function regionDeTopicArn(arn: string): string | null {
  const m = /^arn:aws:sns:([a-z0-9-]+):\d{12}:[A-Za-z0-9_-]{1,256}$/.exec(arn);
  return m ? m[1] : null;
}

/**
 * true si `url` es https a sns.<region>.amazonaws.com exactamente (sin
 * usuario, puerto ni otro host). Se usa para SigningCertURL (además termina
 * en .pem) y para SubscribeURL, que el webhook visita al confirmar.
 */
export function esUrlDeSns(url: string, region: string, exigirPem = false): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  if (u.hostname !== `sns.${region}.amazonaws.com`) return false;
  if (exigirPem && !u.pathname.endsWith(".pem")) return false;
  return true;
}

/** String a firmar de SNS: "Clave\nValor\n" por cada campo, en orden fijo. */
export function stringAFirmarSns(m: MensajeSns): string | null {
  let campos: (keyof MensajeSns)[];
  if (m.Type === "Notification") {
    campos = m.Subject !== undefined ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] : ["Message", "MessageId", "Timestamp", "TopicArn", "Type"];
  } else if (m.Type === "SubscriptionConfirmation" || m.Type === "UnsubscribeConfirmation") {
    if (m.SubscribeURL === undefined || m.Token === undefined) return null;
    campos = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  } else {
    return null;
  }
  return campos.map((k) => `${k}\n${m[k]}\n`).join("");
}

export type ObtenerClaveSns = (certUrl: string) => Promise<KeyObject>;

/**
 * Verifica la firma. `obtenerClave` se inyecta para el test; en producción es
 * clavePublicaDesdeCertificadoSns (baja y cachea el .pem). Nunca lanza.
 */
export async function verificarFirmaSns(m: MensajeSns, obtenerClave: ObtenerClaveSns = clavePublicaDesdeCertificadoSns): Promise<boolean> {
  const algoritmo = m.SignatureVersion === "1" ? "sha1" : m.SignatureVersion === "2" ? "sha256" : null;
  if (!algoritmo) return false;
  const region = regionDeTopicArn(m.TopicArn);
  if (!region || !esUrlDeSns(m.SigningCertURL, region, true)) return false;
  const texto = stringAFirmarSns(m);
  if (texto === null) return false;
  try {
    const clave = await obtenerClave(m.SigningCertURL);
    return verify(algoritmo, Buffer.from(texto, "utf8"), clave, Buffer.from(m.Signature, "base64"));
  } catch (error) {
    console.error("No se pudo verificar la firma SNS", error instanceof Error ? error.message : error);
    return false;
  }
}

// Cache por URL: SNS rota el certificado pocas veces al año y cada rebote
// llega con la misma URL. Acotado para que no crezca sin límite.
const cacheCertificados = new Map<string, KeyObject>();

export async function clavePublicaDesdeCertificadoSns(certUrl: string): Promise<KeyObject> {
  const enCache = cacheCertificados.get(certUrl);
  if (enCache) return enCache;
  // redirect "error": el host ya se validó en esUrlDeSns, un redirect podría
  // llevar a otro lado. fetch valida el TLS de amazonaws.com.
  const res = await fetch(certUrl, { redirect: "error", signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`certificado SNS: HTTP ${res.status}`);
  const pem = await res.text();
  if (pem.length > 20_000) throw new Error("certificado SNS demasiado grande");
  const cert = new X509Certificate(pem);
  const ahora = Date.now();
  if (ahora < Date.parse(cert.validFrom) || ahora > Date.parse(cert.validTo)) throw new Error("certificado SNS fuera de vigencia");
  if (cacheCertificados.size >= 20) cacheCertificados.clear();
  cacheCertificados.set(certUrl, cert.publicKey);
  return cert.publicKey;
}

// ---- Contenido de la notificación de SES ----

export interface Supresion {
  email: string;
  motivo: "rebote" | "queja";
  detalle: string;
}

function direccionDe(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  // A veces viene "Nombre <correo@x.cl>".
  const m = /<([^>]+)>/.exec(valor);
  return (m ? m[1] : valor).trim() || null;
}

/**
 * Direcciones a suprimir según el Message de una notificación de SES (formato
 * de evento de configuration set, `eventType`, o de notificación de
 * identidad, `notificationType`). Solo rebote PERMANENTE y queja: un rebote
 * transitorio (buzón lleno, servidor caído) no dice que la dirección sea mala.
 * Las direcciones vuelven sin normalizar (lo hace quien inserta).
 */
export function extraerSupresiones(mensajeSes: unknown): Supresion[] {
  if (!mensajeSes || typeof mensajeSes !== "object") return [];
  const o = mensajeSes as Record<string, unknown>;
  const tipo = o.eventType ?? o.notificationType;
  const out: Supresion[] = [];
  if (tipo === "Bounce") {
    const b = o.bounce as Record<string, unknown> | undefined;
    if (!b || b.bounceType !== "Permanent" || !Array.isArray(b.bouncedRecipients)) return [];
    for (const r of b.bouncedRecipients as Record<string, unknown>[]) {
      const email = direccionDe(r?.emailAddress);
      if (!email) continue;
      const detalle = [b.bounceSubType, r.diagnosticCode].filter((x) => typeof x === "string" && x).join(": ");
      out.push({ email, motivo: "rebote", detalle: detalle.slice(0, 500) });
    }
  } else if (tipo === "Complaint") {
    const c = o.complaint as Record<string, unknown> | undefined;
    if (!c || !Array.isArray(c.complainedRecipients)) return [];
    // "not-spam" es el destinatario diciendo que NO era spam: no se suprime.
    if (c.complaintFeedbackType === "not-spam") return [];
    for (const r of c.complainedRecipients as Record<string, unknown>[]) {
      const email = direccionDe(r?.emailAddress);
      if (!email) continue;
      const detalle = typeof c.complaintFeedbackType === "string" ? c.complaintFeedbackType : "queja";
      out.push({ email, motivo: "queja", detalle: detalle.slice(0, 500) });
    }
  }
  return out;
}
