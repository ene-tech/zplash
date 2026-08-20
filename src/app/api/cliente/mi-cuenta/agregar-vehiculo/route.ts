import { NextRequest, NextResponse } from "next/server";
import { leerSesionCliente, crearSesionCliente } from "@/lib/auth/clienteSession";
import { vincularPatenteACuenta } from "@/lib/dataAccess/clientes";
import { PATENTE_FORMATO_MSG, isValidPatente, normPlate } from "@/lib/helpers";

export const runtime = "nodejs";

// A diferencia de SolicitudCambioPatente (que reemplaza la patente de un
// vehículo ya vinculado) esto agrega un vehículo a la cuenta. Toda la regla de
// quién puede quedarse con una patente (crear de cero, reclamar una huérfana,
// rechazar una con dueño activo) vive en vincularPatenteACuenta — la comparte
// con el registro de clientes nuevos desde el login.
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { patente?: string; nombre?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = normPlate(body.patente);
  if (!isValidPatente(patente)) {
    return NextResponse.json({ ok: false, error: PATENTE_FORMATO_MSG }, { status: 400 });
  }

  const nombre = (body.nombre || "").trim();
  if (!nombre) {
    return NextResponse.json({ ok: false, error: "Ingresa un nombre referencial para el vehículo" }, { status: 400 });
  }

  const resultado = await vincularPatenteACuenta(patente, nombre, sesion.email, "Portal Cliente (Mi Cuenta)");
  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.error }, { status: 409 });
  }

  // Igual que en quitar-vehiculo: la sesión guarda la lista de clienteIds
  // firmada en la cookie, así que sin re-firmarla acá el vehículo recién
  // vinculado no aparecería en "Mis vehículos" hasta el próximo login.
  await crearSesionCliente([...sesion.clienteIds, resultado.clienteId], sesion.email);

  return NextResponse.json({ ok: true });
}
