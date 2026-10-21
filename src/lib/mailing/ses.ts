import { createHash, createHmac } from "node:crypto";

// Envío por Amazon SES (API v2, SendEmail) llamando al endpoint HTTPS
// directo y firmando con AWS Signature Version 4 a mano. A propósito sin
// @aws-sdk/client-sesv2: es un solo POST con JSON, y el SDK son ~3 MB de
// dependencias más (smithy, credential providers) para eso. La firma SigV4 se
// prueba contra el vector oficial de AWS en ses.test.ts.
//
// Se activa con CORREO_PROVEEDOR=ses (ver ./proveedor); credenciales en
// AWS_SES_REGION / AWS_SES_ACCESS_KEY_ID / AWS_SES_SECRET_ACCESS_KEY, de un
// usuario IAM que solo puede ses:SendEmail (ver docs/migracion-ses.md).

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(clave: string | Buffer, data: string): Buffer {
  return createHmac("sha256", clave).update(data, "utf8").digest();
}

// URI-encode de SigV4 (RFC 3986: solo A-Z a-z 0-9 - _ . ~ quedan sin escapar).
function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export interface CredencialesAws {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Firma un request con AWS SigV4 y devuelve los headers a mandar (los que
 * vinieron + host + x-amz-date + authorization). `fecha` se inyecta para
 * poder probar contra vectores fijos.
 */
export function firmarSigV4(req: {
  metodo: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  servicio: string;
  credenciales: CredencialesAws;
  fecha?: Date;
}): Record<string, string> {
  const url = new URL(req.url);
  const amzDate = (req.fecha || new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dia = amzDate.slice(0, 8);
  const hashBody = sha256Hex(req.body || "");

  const headers: Record<string, string> = { ...(req.headers || {}), host: url.host, "x-amz-date": amzDate };

  const normalizados = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const headersCanonicos = normalizados.map(([k, v]) => `${k}:${v}\n`).join("");
  const headersFirmados = normalizados.map(([k]) => k).join(";");

  const rutaCanonica = url.pathname.split("/").map((seg) => encodeRfc3986(decodeURIComponent(seg))).join("/") || "/";
  const queryCanonica = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const requestCanonico = [req.metodo.toUpperCase(), rutaCanonica, queryCanonica, headersCanonicos, headersFirmados, hashBody].join("\n");
  const alcance = `${dia}/${req.credenciales.region}/${req.servicio}/aws4_request`;
  const stringAFirmar = ["AWS4-HMAC-SHA256", amzDate, alcance, sha256Hex(requestCanonico)].join("\n");

  const kDate = hmac("AWS4" + req.credenciales.secretAccessKey, dia);
  const kRegion = hmac(kDate, req.credenciales.region);
  const kService = hmac(kRegion, req.servicio);
  const kSigning = hmac(kService, "aws4_request");
  const firma = createHmac("sha256", kSigning).update(stringAFirmar, "utf8").digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${req.credenciales.accessKeyId}/${alcance}, SignedHeaders=${headersFirmados}, Signature=${firma}`,
  };
}

const TIPOS_ADJUNTO: Record<string, string> = {
  pdf: "application/pdf",
  xml: "application/xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export interface EnvioSes {
  from: string;
  to: string;
  subject: string;
  html: string;
  adjuntos?: { nombre: string; contenido: Buffer }[];
  configurationSet?: string;
}

/** Body JSON de SendEmail (SES v2). Exportado para el test. */
export function cuerpoSendEmail(envio: EnvioSes): string {
  const extension = (nombre: string) => nombre.split(".").pop()?.toLowerCase() || "";
  return JSON.stringify({
    FromEmailAddress: envio.from,
    Destination: { ToAddresses: [envio.to] },
    Content: {
      Simple: {
        Subject: { Data: envio.subject, Charset: "UTF-8" },
        Body: { Html: { Data: envio.html, Charset: "UTF-8" } },
        ...(envio.adjuntos?.length
          ? {
              Attachments: envio.adjuntos.map((a) => ({
                FileName: a.nombre,
                RawContent: a.contenido.toString("base64"),
                ContentType: TIPOS_ADJUNTO[extension(a.nombre)] || "application/octet-stream",
                ContentDisposition: "ATTACHMENT",
              })),
            }
          : {}),
      },
    },
    ...(envio.configurationSet ? { ConfigurationSetName: envio.configurationSet } : {}),
  });
}

export interface ErrorSes {
  name: string;
  message: string;
  status: number;
}

export type ResultadoSes = { ok: true; messageId?: string } | { ok: false; error: ErrorSes };

/** SendEmail contra SES v2. Nunca lanza: un fallo de red vuelve como error. */
export async function enviarPorSes(credenciales: CredencialesAws, envio: EnvioSes): Promise<ResultadoSes> {
  const url = `https://email.${credenciales.region}.amazonaws.com/v2/email/outbound-emails`;
  const body = cuerpoSendEmail(envio);
  const headers = firmarSigV4({ metodo: "POST", url, headers: { "content-type": "application/json" }, body, servicio: "ses", credenciales });
  // host lo pone fetch con el mismo valor (es header prohibido en undici).
  delete headers.host;
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(15_000) });
    const texto = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = texto ? JSON.parse(texto) : {};
    } catch {
      // cuerpo no-JSON (un 502 de un balanceador): queda en `message` crudo
    }
    if (res.ok) return { ok: true, messageId: typeof json.MessageId === "string" ? json.MessageId : undefined };
    // El tipo viene en x-amzn-ErrorType ("BadRequestException:http://...") o en el body.
    const crudo = res.headers.get("x-amzn-errortype") || (typeof json.__type === "string" ? json.__type : "") || `HTTP ${res.status}`;
    const tipo = crudo.split(":")[0].split("#").pop() || crudo;
    const mensaje = String(json.message || json.Message || texto || "").slice(0, 500);
    return { ok: false, error: { name: tipo, message: mensaje, status: res.status } };
  } catch (e) {
    return { ok: false, error: { name: "ErrorDeRed", message: e instanceof Error ? e.message : String(e), status: 0 } };
  }
}

