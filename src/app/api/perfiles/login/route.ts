import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles } from "@/db/schema";
import { verificarYMigrarClave } from "@/lib/perfiles";
import { crearSesion } from "@/lib/session";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import type { Modulo } from "@/types";

export const runtime = "nodejs";

const LIMITE_INTENTOS = 8;
const VENTANA_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (rateLimited(`perfiles-login:${clienteIp(request)}`, LIMITE_INTENTOS, VENTANA_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: { id?: unknown; clave?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const { id, clave } = body;
  if (typeof id !== "string" || !id || typeof clave !== "string" || !clave) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  let data: { nombre: string; clave: string; modulos: string[] } | undefined;
  try {
    [data] = await getDb()
      .select({ nombre: perfiles.nombre, clave: perfiles.clave, modulos: perfiles.modulos })
      .from(perfiles)
      .where(eq(perfiles.id, id))
      .limit(1);
  } catch (error) {
    console.error("Error consultando perfiles", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }
  if (!data || !(await verificarYMigrarClave(id, clave, data.clave))) {
    return NextResponse.json({ ok: false, error: "Contraseña incorrecta" }, { status: 401 });
  }

  await crearSesion({ id, nombre: data.nombre, modulos: data.modulos as Modulo[] });
  return NextResponse.json({ ok: true, nombre: data.nombre, modulos: data.modulos });
}
