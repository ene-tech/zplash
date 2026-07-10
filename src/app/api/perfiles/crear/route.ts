import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles } from "@/db/schema";

export const runtime = "nodejs";

// Solo quien ya tiene el módulo "perfiles" puede dar de alta un perfil
// nuevo. Como no hay sesiones reales, la única prueba de identidad que el
// servidor puede verificar es la contraseña actual del actor (mismo
// principio que /api/perfiles/cambiar-clave).
export async function POST(request: NextRequest) {
  let body: { actorId?: unknown; actorClave?: unknown; nombre?: unknown; clave?: unknown; modulos?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const { actorId, actorClave, nombre, clave, modulos } = body;
  if (
    typeof actorId !== "string" ||
    !actorId ||
    typeof actorClave !== "string" ||
    !actorClave ||
    typeof nombre !== "string" ||
    !nombre.trim() ||
    typeof clave !== "string" ||
    clave.length < 4 ||
    !Array.isArray(modulos) ||
    !modulos.every((m) => typeof m === "string")
  ) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
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
  if (!actorRow || actorRow.clave !== actorClave) {
    return NextResponse.json({ ok: false, error: "Tu contraseña actual es incorrecta" }, { status: 401 });
  }
  if (!actorRow.modulos.includes("perfiles")) {
    return NextResponse.json({ ok: false, error: "No tienes permiso para crear perfiles" }, { status: 403 });
  }

  const id = "p" + Date.now() + Math.floor(Math.random() * 1000);
  try {
    await db.insert(perfiles).values({ id, nombre: nombre.trim(), clave, modulos: modulos as string[] });
  } catch (error) {
    console.error("Error creando perfil", error);
    return NextResponse.json({ ok: false, error: "Ya existe un perfil con ese nombre" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, id });
}
