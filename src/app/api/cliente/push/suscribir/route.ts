import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { uid } from "@/lib/helpers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (typeof endpoint !== "string" || !endpoint || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent");
  const db = getDb();
  try {
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
