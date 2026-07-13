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

// Solo quien ya tiene el módulo "perfiles" puede dar de alta un perfil
// nuevo. Como no hay sesiones reales, la única prueba de identidad que el
// servidor puede verificar es la contraseña actual del actor (mismo
// principio que /api/perfiles/cambiar-clave).
export async function POST(request: NextRequest) {
  if (rateLimited(`perfiles-crear:${clienteIp(request)}`, LIMITE_INTENTOS, VENTANA_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

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
    clave.length < CLAVE_MIN_LARGO ||
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
  if (!actorRow || !(await verificarYMigrarClave(actorId, actorClave, actorRow.clave))) {
    return NextResponse.json({ ok: false, error: "Tu contraseña actual es incorrecta" }, { status: 401 });
  }
  if (!actorRow.modulos.includes("perfiles")) {
    return NextResponse.json({ ok: false, error: "No tienes permiso para crear perfiles" }, { status: 403 });
  }

  const id = "p" + Date.now() + Math.floor(Math.random() * 1000);
  try {
    await db.insert(perfiles).values({ id, nombre: nombre.trim(), clave: await hashClave(clave), modulos: modulos as string[] });
  } catch (error) {
    console.error("Error creando perfil", error);
    return NextResponse.json({ ok: false, error: "Ya existe un perfil con ese nombre" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, id });
}
