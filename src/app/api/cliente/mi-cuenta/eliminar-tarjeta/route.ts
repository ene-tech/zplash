import { NextRequest, NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suscripcionesOneclick } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { normPlate } from "@/lib/helpers";
import { cancelarSuscripcionOneclick } from "@/lib/dataAccess/oneclick";
import { evaluarReglasCorreoPorSuscripcionCancelada } from "@/lib/mailing/reglas";

export const runtime = "nodejs";

// A diferencia de quitar-vehiculo (que solo desvincula la patente de la
// cuenta), esto sí da de baja la tarjeta de verdad: reusa
// cancelarSuscripcionOneclick, la misma función que usa el admin desde
// SuscripcionesTab/ClienteInfoModal (da de baja en Transbank vía
// oneclickInscription().delete y marca "cancelada" localmente).
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { patente?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = normPlate(body.patente);
  const clientesEncontrados = await getClientesByIds(sesion.clienteIds);
  const cliente = clientesEncontrados.find((c) => normPlate(c.patente) === patente);
  if (!cliente) {
    return NextResponse.json({ ok: false, error: "Ese vehículo no está en tu cuenta" }, { status: 404 });
  }

  const db = getDb();
  const [suscripcion] = await db.select().from(suscripcionesOneclick).where(eq(suscripcionesOneclick.patente, patente)).limit(1);
  if (!suscripcion || (suscripcion.estado !== "activa" && suscripcion.estado !== "suspendida")) {
    return NextResponse.json({ ok: false, error: "No tienes una tarjeta guardada para ese vehículo" }, { status: 404 });
  }

  await cancelarSuscripcionOneclick(suscripcion.id);

  // El mismo correo de respaldo que manda anularSuscripcion (@/lib/serverActions/
  // oneclick) cuando la baja la hace el admin desde la ficha: el cliente que se
  // da de baja solo también necesita su comprobante, y es la misma ReglaCorreo
  // ("suscripcion_cancelada") para no tener dos textos que mantener. En after()
  // para no hacerle esperar el envío, igual que el resto de los correos de reglas.
  after(() => evaluarReglasCorreoPorSuscripcionCancelada(cliente));
  return NextResponse.json({ ok: true });
}
