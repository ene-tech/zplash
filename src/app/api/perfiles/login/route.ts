import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles } from "@/db/schema";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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
  if (!data || data.clave !== clave) {
    return NextResponse.json({ ok: false, error: "Contraseña incorrecta" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, nombre: data.nombre, modulos: data.modulos });
}
