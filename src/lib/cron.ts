import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Puerta de las rutas disparadas por el cron de Vercel (ver `crons` en
 * vercel.json). Vercel manda automáticamente "Authorization: Bearer
 * $CRON_SECRET" cuando esa env var está configurada en el proyecto.
 *
 * Devuelve la respuesta de error si el pedido NO está autorizado, o null si
 * puede seguir. Las 4 rutas de cron traían este mismo bloque copiado —
 * incluido el 500 cuando falta la env var, que es a propósito: sin secreto no
 * hay forma de distinguir a Vercel de cualquier otro, y estas rutas cobran
 * tarjetas y mandan correos, así que el modo seguro es no correr.
 */
export function rechazoSiNoEsCron(request: NextRequest): NextResponse | null {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    console.error("CRON_SECRET no configurado");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }
  const header = request.headers.get("authorization");
  if (!header) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(header);
  const ok = esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);
  return ok ? null : NextResponse.json({ error: "No autorizado" }, { status: 401 });
}
