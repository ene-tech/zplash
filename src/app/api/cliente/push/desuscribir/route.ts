import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
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
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), inArray(pushSubscriptions.clienteId, sesion.clienteIds)));

  return NextResponse.json({ ok: true });
}
