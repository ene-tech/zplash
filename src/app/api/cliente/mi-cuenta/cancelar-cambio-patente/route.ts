import { NextRequest, NextResponse } from "next/server";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { actualizarPatentePendiente, getClientesByIds } from "@/lib/dataAccess/clientes";
import { normPlate } from "@/lib/helpers";

export const runtime = "nodejs";

// Contraparte de ./solicitar-cambio-patente: limpia patentePendiente/
// patentePendienteDesde antes de que la solicitud se aplique en la próxima
// renovación (ver cancelarCambioPatente en @/lib/serverActions/clientes,
// misma acción pero para el Portal Cliente).
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
  const objetivo = clientesEncontrados.find((c) => normPlate(c.patente) === patente);
  if (!objetivo) {
    return NextResponse.json({ ok: false, error: "Ese vehículo no está en tu cuenta" }, { status: 404 });
  }

  const ok = await actualizarPatentePendiente(objetivo.id, null);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "No se pudo cancelar la solicitud" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
