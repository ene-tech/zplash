import { NextRequest, NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { uid } from "@/lib/helpers";
import { PREFIJO_FCM } from "@/lib/push/fcm";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; fcmToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  // La app nativa manda su token de Firebase en vez de una suscripción Web
  // Push: se guarda en la misma tabla con endpoint "fcm:<token>" y sin llaves
  // (ver @/lib/push/fcm), así enviarPush llega a los dos sin otra tabla.
  const esApp = typeof body.fcmToken === "string" && body.fcmToken.length > 0 && body.fcmToken.length < 4096;
  const endpoint = esApp ? `${PREFIJO_FCM}${body.fcmToken}` : body.endpoint;
  const keys = esApp ? { p256dh: "", auth: "" } : body.keys;
  if (typeof endpoint !== "string" || !endpoint || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent");
  const db = getDb();
  try {
    // El teléfono con la app es de quien tiene la sesión ahora: si antes entró
    // otra persona en el mismo teléfono (familiar, teléfono prestado), sus
    // filas se borran para que sus avisos y descuentos no lleguen acá.
    if (esApp) {
      await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), notInArray(pushSubscriptions.clienteId, sesion.clienteIds)));
    }
    // Una fila por cada clienteId de la sesión (ver comentario en
    // @/db/schema/pushSubscriptions): un mismo teléfono con varias patentes
    // recibe avisos de vehículo filtrando por clienteId puntual.
    await Promise.all(
      sesion.clienteIds.map((clienteId) =>
        db
          .insert(pushSubscriptions)
          .values({ id: uid(), clienteId, endpoint, p256dh: keys.p256dh as string, auth: keys.auth as string, userAgent })
          .onConflictDoUpdate({
            target: [pushSubscriptions.endpoint, pushSubscriptions.clienteId],
            set: { p256dh: keys.p256dh as string, auth: keys.auth as string, userAgent },
          })
      )
    );
  } catch (error) {
    console.error("Error guardando suscripción push", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
