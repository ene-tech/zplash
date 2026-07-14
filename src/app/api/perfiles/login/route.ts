import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles } from "@/db/schema";
import { verificarYMigrarClave } from "@/lib/perfiles";
import { crearSesion } from "@/lib/session";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { origenValido } from "@/lib/csrf";
import type { Modulo } from "@/types";

export const runtime = "nodejs";

const LIMITE_INTENTOS = 8;
const VENTANA_MS = 5 * 60 * 1000;

// Además del límite por IP de arriba, uno por perfil objetivo: sin este,
// alguien probando contraseñas contra un mismo perfil desde varias IPs
// (o detrás de un proxy rotativo) no lo activaría nunca.
const LIMITE_INTENTOS_PERFIL = 10;
const VENTANA_MS_PERFIL = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!origenValido(request)) {
    return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  }
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

  if (rateLimited(`perfiles-login-objetivo:${id}`, LIMITE_INTENTOS_PERFIL, VENTANA_MS_PERFIL)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let data: { nombre: string; clave: string; modulos: string[]; claveVersion: number } | undefined;
  try {
    [data] = await getDb()
      .select({ nombre: perfiles.nombre, clave: perfiles.clave, modulos: perfiles.modulos, claveVersion: perfiles.claveVersion })
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

  await crearSesion({ id, nombre: data.nombre, modulos: data.modulos as Modulo[], claveVersion: data.claveVersion });
  return NextResponse.json({ ok: true, nombre: data.nombre, modulos: data.modulos });
}
