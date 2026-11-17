import "server-only";
import { createSign } from "node:crypto";

// Push de la app nativa (Android/iOS) vía Firebase Cloud Messaging, API HTTP v1.
// Sin firebase-admin: solo hace falta firmar un JWT de la cuenta de servicio
// (RS256, node:crypto) y cambiarlo por un access token de Google.
//
// FIREBASE_SERVICE_ACCOUNT = el JSON completo de la cuenta de servicio
// (Firebase → Configuración del proyecto → Cuentas de servicio → Generar clave).
//
// En push_subscriptions los dispositivos de la app se guardan con
// endpoint = "fcm:<token>" (ver /api/cliente/push/suscribir), al lado de los
// navegadores con Web Push.

export const PREFIJO_FCM = "fcm:";

type CuentaServicio = { project_id: string; client_email: string; private_key: string };

// Se cachea la promesa, no solo el resultado: varios envíos en paralelo con
// la caché fría comparten un mismo pedido a Google.
let cache: { token: Promise<string>; venceEn: number } | null = null;

function cuentaServicio(): CuentaServicio | null {
  const crudo = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as CuentaServicio;
  } catch {
    console.error("FIREBASE_SERVICE_ACCOUNT no es un JSON válido");
    return null;
  }
}

export function fcmConfigurado(): boolean {
  return !!cuentaServicio();
}

const base64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function accessToken(cuenta: CuentaServicio): Promise<string> {
  if (cache && cache.venceEn > Date.now() + 60_000) return cache.token;
  const token = pedirAccessToken(cuenta);
  // 55 min provisorios hasta saber el vencimiento real; si falla, se olvida.
  cache = { token, venceEn: Date.now() + 55 * 60_000 };
  token.catch(() => {
    cache = null;
  });
  return token;
}

async function pedirAccessToken(cuenta: CuentaServicio): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  const encabezado = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = base64url(
    JSON.stringify({
      iss: cuenta.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: ahora,
      exp: ahora + 3600,
    })
  );
  const firma = createSign("RSA-SHA256").update(`${encabezado}.${cuerpo}`).sign(cuenta.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${encabezado}.${cuerpo}.${firma}` }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  if (cache) cache.venceEn = Date.now() + json.expires_in * 1000;
  return json.access_token;
}

export type ResultadoFcm = "ok" | "invalido" | "error";

/** Manda una notificación a un token de la app. "invalido" = el token ya no
 * existe (app desinstalada o token rotado): el llamador borra la fila. */
export async function enviarFcm(token: string, payload: { title: string; body: string; url?: string }): Promise<ResultadoFcm> {
  const cuenta = cuentaServicio();
  if (!cuenta) return "error";
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${cuenta.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken(cuenta)}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.url ? { url: payload.url } : undefined,
          android: { priority: "high" },
        },
      }),
    });
    if (res.ok) return "ok";
    const texto = await res.text();
    // Token que ya no existe, mal formado o de otro proyecto. Un 400 por otro
    // motivo (payload) no borra la fila: sería culpa nuestra, no del teléfono.
    if (
      res.status === 404 ||
      texto.includes("UNREGISTERED") ||
      texto.includes("SENDER_ID_MISMATCH") ||
      (res.status === 400 && texto.includes("registration token"))
    ) {
      return "invalido";
    }
    console.error("FCM rechazó el envío", res.status, texto);
    return "error";
  } catch (error) {
    console.error("Error enviando FCM", error);
    return "error";
  }
}
