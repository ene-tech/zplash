import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getConfig } from "@/lib/dataAccess/config";
import { PREFIJO_FCM } from "@/lib/push/fcm";
import { rateLimited } from "@/lib/rateLimit";
import { evaluarReglasCercaLocal } from "@/lib/whatsapp/reglas";

export const runtime = "nodejs";

// Geocerca de la app nativa (descuento al pasar cerca del local).
//
// GET: la zona que tiene que vigilar el teléfono. La app la pide al abrir y
// la registra en el sistema operativo; sin coordenadas cargadas en
// Configuración la app no vigila nada.
export async function GET() {
  const config = await getConfig();
  if (config.localLat == null || config.localLng == null) return NextResponse.json({ activa: false });
  return NextResponse.json({ activa: true, lat: config.localLat, lng: config.localLng, radio: config.geocercaRadioMetros });
}

// POST: el teléfono entró a la zona. Lo llama el código nativo de la app en
// segundo plano (sin la web abierta, así que sin cookie de sesión): se
// identifica con su token de Firebase, que solo conocen el teléfono y esta
// base (push_subscriptions con endpoint "fcm:<token>", ver
// /api/cliente/push/suscribir). Responde siempre 200 sin decir si hubo
// descuento: el aviso, si corresponde, llega como push.
export async function POST(request: NextRequest) {
  let token: unknown;
  try {
    ({ token } = await request.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof token !== "string" || !token || token.length > 4096) return NextResponse.json({ ok: false }, { status: 400 });

  const filas = await getDb()
    .select({ clienteId: pushSubscriptions.clienteId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, `${PREFIJO_FCM}${token}`));
  if (!filas.length) return NextResponse.json({ ok: true });

  // El sistema operativo puede repetir la entrada (GPS que salta en el borde
  // de la zona); el disparo ya es idempotente, esto solo corta el abuso. Va
  // después de la búsqueda: un token inventado no deja fila en rate_limits.
  if (await rateLimited(`geocerca:${token.slice(-32)}`, 10, 3600_000)) return NextResponse.json({ ok: true });

  await evaluarReglasCercaLocal(filas.map((f) => f.clienteId)).catch((error) => console.error("Error evaluando geocerca", error));
  return NextResponse.json({ ok: true });
}
