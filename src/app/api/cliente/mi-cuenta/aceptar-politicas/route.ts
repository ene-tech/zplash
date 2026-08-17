import { NextResponse } from "next/server";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { registrarAceptacionPoliticas } from "@/lib/dataAccess/clientes";

export const runtime = "nodejs";

// Deja registro de que esta cuenta aceptó la versión vigente de las
// "Políticas de Funcionamiento y Garantía" (ver @/lib/politicas). El correo
// sale de la cookie de sesión firmada, nunca del body: si no, cualquiera
// podría aceptar las políticas a nombre de otro cliente. La versión también
// la pone el servidor, por lo mismo.
export async function POST() {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  await registrarAceptacionPoliticas(sesion.email);

  return NextResponse.json({ ok: true });
}
