import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pushSubscripcionesPerfil } from "@/db/schema";
import { sesionActual } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { endpoint?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const { endpoint } = body;
  if (typeof endpoint !== "string" || !endpoint) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  await getDb()
    .delete(pushSubscripcionesPerfil)
    .where(and(eq(pushSubscripcionesPerfil.endpoint, endpoint), eq(pushSubscripcionesPerfil.perfilId, sesion.id)));

  return NextResponse.json({ ok: true });
}
