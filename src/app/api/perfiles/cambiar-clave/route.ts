import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles } from "@/db/schema";

export const runtime = "nodejs";

// Sin sesiones reales, la única prueba de identidad que el servidor puede
// verificar es la contraseña actual del actor — por eso se exige siempre,
// incluso cuando alguien con el módulo "permisos" cambia la contraseña de
// otro perfil.
export async function POST(request: NextRequest) {
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
  if (claveNueva.length < 4) {
    return NextResponse.json({ ok: false, error: "La nueva contraseña debe tener al menos 4 caracteres" }, { status: 400 });
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
  if (!actorRow || actorRow.clave !== actorClaveActual) {
    return NextResponse.json({ ok: false, error: "Tu contraseña actual es incorrecta" }, { status: 401 });
  }
  if (objetivoId !== actorId && !actorRow.modulos.includes("permisos")) {
    return NextResponse.json({ ok: false, error: "No tienes permiso para cambiar la contraseña de otro perfil" }, { status: 403 });
  }

  try {
    await db.update(perfiles).set({ clave: claveNueva }).where(eq(perfiles.id, objetivoId));
  } catch (error) {
    console.error("Error actualizando contraseña de perfil", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
