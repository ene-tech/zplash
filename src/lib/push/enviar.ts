import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";

function vapidConfigurado(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configurarVapid(): void {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contacto@zplash.cl",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

// Envía una notificación push a todas las suscripciones de un cliente
// puntual (una patente, ver comentario en @/db/schema/pushSubscriptions —
// no a todo el teléfono de la sesión). Devuelve true si logró entregar al
// menos una, para que el llamador (ejecutarAccionRegla en
// @/lib/whatsapp/reglas) decida si igual manda WhatsApp de respaldo.
// Las suscripciones que el navegador ya invalidó (404/410) se borran solas.
export async function enviarPush(clienteId: string, payload: { title: string; body: string; url?: string }): Promise<boolean> {
  if (!vapidConfigurado()) return false;
  configurarVapid();

  const db = getDb();
  const suscripciones = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.clienteId, clienteId));
  if (!suscripciones.length) return false;

  const cuerpo = JSON.stringify(payload);
  let algunaEntregada = false;
  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo);
        algunaEntregada = true;
        await db.update(pushSubscriptions).set({ ultimoEnvioEn: new Date().toISOString() }).where(eq(pushSubscriptions.id, s.id));
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } else {
          console.error("Error enviando push", error);
        }
      }
    })
  );
  return algunaEntregada;
}
