import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles, pushSubscripcionesPerfil, pushSubscriptions } from "@/db/schema";

type PayloadPush = { title: string; body: string; url?: string };
type Suscripcion = { id: string; endpoint: string; p256dh: string; auth: string };

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

// Manda `payload` a cada suscripción y devuelve true si al menos una se
// entregó. `onExito`/`onInvalida` los define el llamador porque cada tabla
// (pushSubscriptions vs pushSubscripcionesPerfil) necesita su propio
// update/delete — esta función solo orquesta el envío en sí.
async function despacharPush(
  suscripciones: Suscripcion[],
  payload: PayloadPush,
  onExito: (id: string) => Promise<unknown>,
  onInvalida: (id: string) => Promise<unknown>
): Promise<boolean> {
  const cuerpo = JSON.stringify(payload);
  let algunaEntregada = false;
  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo);
        algunaEntregada = true;
        await onExito(s.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await onInvalida(s.id);
        } else {
          console.error("Error enviando push", error);
        }
      }
    })
  );
  return algunaEntregada;
}

// Envía una notificación push a todas las suscripciones de un cliente
// puntual (una patente, ver comentario en @/db/schema/pushSubscriptions —
// no a todo el teléfono de la sesión). Devuelve true si logró entregar al
// menos una, para que el llamador (ejecutarAccionRegla en
// @/lib/whatsapp/reglas) decida si igual manda WhatsApp de respaldo.
// Las suscripciones que el navegador ya invalidó (404/410) se borran solas.
export async function enviarPush(clienteId: string, payload: PayloadPush): Promise<boolean> {
  if (!vapidConfigurado()) return false;
  configurarVapid();

  const db = getDb();
  const suscripciones = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.clienteId, clienteId));
  if (!suscripciones.length) return false;

  return despacharPush(
    suscripciones,
    payload,
    (id) => db.update(pushSubscriptions).set({ ultimoEnvioEn: new Date().toISOString() }).where(eq(pushSubscriptions.id, id)),
    (id) => db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id))
  );
}

// Avisa al perfil de staff "Gerencia" (ver PERFILES_DEFAULT en
// @/lib/helpers/perfiles, único con ese nombre por el unique de
// perfiles.nombre) — hoy solo lo dispara OPCIONES_HUMANO en
// @/lib/whatsapp/router cuando un cliente pide hablar con una persona en el
// bot. Devuelve false sin lanzar si Gerencia no existe, no tiene VAPID
// configurado, o no tiene ningún dispositivo suscrito — el bot igual sigue
// respondiendo al cliente aunque el aviso no llegue a nadie.
export async function enviarPushAGerencia(payload: PayloadPush): Promise<boolean> {
  if (!vapidConfigurado()) return false;
  configurarVapid();

  const db = getDb();
  const [gerencia] = await db.select({ id: perfiles.id }).from(perfiles).where(eq(perfiles.nombre, "Gerencia")).limit(1);
  if (!gerencia) return false;

  const suscripciones = await db.select().from(pushSubscripcionesPerfil).where(eq(pushSubscripcionesPerfil.perfilId, gerencia.id));
  if (!suscripciones.length) return false;

  return despacharPush(
    suscripciones,
    payload,
    (id) => db.update(pushSubscripcionesPerfil).set({ ultimoEnvioEn: new Date().toISOString() }).where(eq(pushSubscripcionesPerfil.id, id)),
    (id) => db.delete(pushSubscripcionesPerfil).where(eq(pushSubscripcionesPerfil.id, id))
  );
}
