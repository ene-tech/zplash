import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cupones } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { cuponFromRow } from "@/lib/dataAccess/cupones";
import { esTicketGestionable, loteIdDeTicket, normalizarReglaPatentes } from "@/lib/ticketsGestion";

export const runtime = "nodejs";

// Regla de patentes de un Pack de Tickets desde Mi Cuenta: para un ticket
// (`codigo`) o para todo el lote (`loteId`). Solo toca tickets sin usar y
// vigentes — uno usado es comprobante de un canje — y solo los del correo de
// la sesión: a diferencia de cuponesDeLaCuentaWhere no entra por patente, así
// que un chofer que ve un ticket de la flota no le puede cambiar la regla.
// `patentes: []` deja el ticket abierto a cualquier patente (null en la base).
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { codigo?: unknown; loteId?: unknown; patentes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const codigo = typeof body.codigo === "string" ? body.codigo.trim().toUpperCase() : "";
  const loteId = typeof body.loteId === "string" ? body.loteId.trim() : "";
  if (!codigo === !loteId) {
    return NextResponse.json({ ok: false, error: "Indica un ticket o un lote" }, { status: 400 });
  }
  const regla = normalizarReglaPatentes(body.patentes);
  if (!regla.ok) {
    return NextResponse.json({ ok: false, error: regla.error }, { status: 400 });
  }

  const db = getDb();
  const filas = await db
    .select()
    .from(cupones)
    .where(
      and(
        sql`lower(${cupones.email}) = ${sesion.email.trim().toLowerCase()}`,
        eq(cupones.usado, false),
        gt(cupones.fechaCaducidad, new Date().toISOString()),
        // El lote se filtra de nuevo abajo con loteIdDeTicket: el LIKE solo
        // acota la consulta, y "_" o "%" en un id no deben ampliarla.
        codigo ? eq(cupones.codigo, codigo) : sql`${cupones.id} like ${loteId.replace(/[\\%_]/g, "\\$&") + "-%"}`
      )
    );
  const ids = filas
    .map(cuponFromRow)
    .filter((c) => esTicketGestionable(c) && (codigo || loteIdDeTicket(c.id) === loteId))
    .map((c) => c.id);
  if (!ids.length) {
    return NextResponse.json(
      { ok: false, error: "No hay tickets vigentes sin usar de tu cuenta para cambiar" },
      { status: 404 }
    );
  }

  await db
    .update(cupones)
    .set({ patentesAutorizadas: regla.patentes.length ? regla.patentes : null })
    .where(and(inArray(cupones.id, ids), eq(cupones.usado, false)));
  return NextResponse.json({ ok: true, actualizados: ids.length });
}
