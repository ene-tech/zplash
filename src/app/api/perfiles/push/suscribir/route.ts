import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { pushSubscripcionesPerfil } from "@/db/schema";
import { uid } from "@/lib/helpers";
import { sesionActual } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sesion = await sesionActual();
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
  try {
    await getDb()
      .insert(pushSubscripcionesPerfil)
      .values({ id: uid(), perfilId: sesion.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
      .onConflictDoUpdate({
        target: [pushSubscripcionesPerfil.endpoint, pushSubscripcionesPerfil.perfilId],
        set: { p256dh: keys.p256dh, auth: keys.auth, userAgent },
      });
  } catch (error) {
    console.error("Error guardando suscripción push de perfil", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
