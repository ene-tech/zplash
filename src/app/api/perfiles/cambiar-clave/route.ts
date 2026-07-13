import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles } from "@/db/schema";
import { hashClave } from "@/lib/auth";
import { verificarYMigrarClave } from "@/lib/perfiles";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_INTENTOS = 20;
const VENTANA_MS = 5 * 60 * 1000;

const CLAVE_MIN_LARGO = 6;

// Sin sesiones reales, la única prueba de identidad que el servidor puede
// verificar es la contraseña actual del actor — por eso se exige siempre,
// incluso cuando alguien con el módulo "permisos" cambia la contraseña de
// otro perfil.
export async function POST(request: NextRequest) {
  if (rateLimited(`perfiles-cambiar-clave:${clienteIp(request)}`, LIMITE_INTENTOS, VENTANA_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: { actorId?: unknown; actorClaveActual?: unknown; objetivoId?: unknown; claveNueva?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const { actorId, actorClaveActual, objetivoId, claveNueva } = body;
  if (
    typeof actorId !== "string" ||
    !actorId ||
    typeof objetivoId !== "string" ||
    !objetivoId ||
    typeof actorClaveActual !== "string" ||
    typeof claveNueva !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }
  if (claveNueva.length < CLAVE_MIN_LARGO) {
    return NextResponse.json({ ok: false, error: `La nueva contraseña debe tener al menos ${CLAVE_MIN_LARGO} caracteres` }, { status: 400 });
  }

  const db = getDb();
  let actorRow: { clave: string; modulos: string[] } | undefined;
  try {
    [actorRow] = await db
      .select({ clave: perfiles.clave, modulos: perfiles.modulos })
      .from(perfiles)
      .where(eq(perfiles.id, actorId))
      .limit(1);
  } catch (error) {
    console.error("Error consultando perfiles", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }
  if (!actorRow || !(await verificarYMigrarClave(actorId, actorClaveActual, actorRow.clave))) {
    return NextResponse.json({ ok: false, error: "Tu contraseña actual es incorrecta" }, { status: 401 });
  }
  if (objetivoId !== actorId && !actorRow.modulos.includes("permisos")) {
    return NextResponse.json({ ok: false, error: "No tienes permiso para cambiar la contraseña de otro perfil" }, { status: 403 });
  }

  try {
    await db.update(perfiles).set({ clave: await hashClave(claveNueva) }).where(eq(perfiles.id, objetivoId));
  } catch (error) {
    console.error("Error actualizando contraseña de perfil", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
