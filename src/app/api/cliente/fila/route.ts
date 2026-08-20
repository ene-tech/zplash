import { NextResponse } from "next/server";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { leerFotoFila } from "@/lib/dataAccess/storage";
import { fotoFilaFresca, sigueVigenteHoy } from "@/lib/helpers";

export const runtime = "nodejs";

// Foto de la fila de entrada para el cliente con plan vigente (ver
// FilaEnVivo.tsx). El 403 es el gate de verdad: FilaEnVivo además esconde la
// sección fuera de la PWA instalada, pero eso es cosmético y se falsea desde
// el navegador -- quién puede ver la cámara se decide acá.
//
// Basta con que UNA de las patentes de la cuenta tenga plan vigente: la
// sesión resuelve varias filas de `clientes` por el mismo correo y quien mira
// la fila es la persona, no el vehículo.
export async function GET() {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  const clientes = await getClientesByIds(sesion.clienteIds);
  if (!clientes.some((c) => sigueVigenteHoy(c.vencimiento))) {
    return NextResponse.json({ ok: false, error: "Sin plan vigente" }, { status: 403 });
  }

  const foto = await leerFotoFila();
  // url null (y no un 404) = tiene permiso pero ahora mismo no hay imagen
  // fresca: el PC del local está apagado o sin red. Son dos estados distintos
  // en la UI, uno esconde la sección y el otro muestra "sin imagen".
  if (!foto || !fotoFilaFresca(foto.capturadoEn)) {
    return NextResponse.json({ ok: true, url: null });
  }
  return NextResponse.json({ ok: true, url: foto.url });
}
