import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { cupones } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { cuponesDeLaCuentaWhere } from "@/lib/dataAccess/cupones";

export const runtime = "nodejs";

// "Eliminar" un ticket caducado de "Mis tickets y cupones" es solo dejar de
// mostrarlo en esta cuenta (cupones.oculto_en_cuenta): la fila sigue en la
// base para el historial del lote y la medición de campañas. Solo caducados y
// sin usar — uno vigente se perdería de vista sin que el cliente lo note, y
// uno usado es comprobante de un canje.
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { codigo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const codigo = (typeof body.codigo === "string" ? body.codigo : "").trim().toUpperCase();
  if (!codigo) {
    return NextResponse.json({ ok: false, error: "Falta el código" }, { status: 400 });
  }

  const [oculto] = await getDb()
    .update(cupones)
    .set({ ocultoEnCuenta: true })
    .where(
      and(
        eq(cupones.codigo, codigo),
        eq(cupones.usado, false),
        lt(cupones.fechaCaducidad, new Date().toISOString()),
        cuponesDeLaCuentaWhere(sesion.email, sesion.clienteIds)
      )
    )
    .returning({ id: cupones.id });
  if (!oculto) {
    return NextResponse.json({ ok: false, error: "Solo se pueden eliminar tickets caducados de tu cuenta" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
