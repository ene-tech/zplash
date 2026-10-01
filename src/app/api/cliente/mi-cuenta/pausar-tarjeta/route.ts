import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suscripcionesOneclick } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { normPlate } from "@/lib/helpers";
import { reactivarSuscripcionOneclick, suspenderSuscripcionOneclick } from "@/lib/dataAccess/oneclick";

export const runtime = "nodejs";

// Pausar/reanudar el cobro automático desde Mi Cuenta, sin eliminar la tarjeta
// (eso es /eliminar-tarjeta, que la da de baja en Transbank y obliga a
// reinscribirla). Reusa el mismo "suspendida" que el admin pone desde
// SuscripcionesTab: el cron solo cobra "activa", así que no hay más que tocar.
// Solo se mueve activa <-> suspendida: una "pausada_validacion_x5" la levanta
// el cron cuando el cliente acepta el X5, no este botón.
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { patente?: string; pausar?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = normPlate(body.patente);
  const clientesEncontrados = await getClientesByIds(sesion.clienteIds);
  if (!clientesEncontrados.some((c) => normPlate(c.patente) === patente)) {
    return NextResponse.json({ ok: false, error: "Ese vehículo no está en tu cuenta" }, { status: 404 });
  }

  const db = getDb();
  const [suscripcion] = await db.select().from(suscripcionesOneclick).where(eq(suscripcionesOneclick.patente, patente)).limit(1);
  const desde = body.pausar ? "activa" : "suspendida";
  if (!suscripcion || suscripcion.estado !== desde) {
    return NextResponse.json(
      { ok: false, error: body.pausar ? "No tienes una renovación automática activa para ese vehículo" : "Esa renovación automática no está pausada" },
      { status: 409 }
    );
  }

  await (body.pausar ? suspenderSuscripcionOneclick(suscripcion.id) : reactivarSuscripcionOneclick(suscripcion.id));
  return NextResponse.json({ ok: true });
}
