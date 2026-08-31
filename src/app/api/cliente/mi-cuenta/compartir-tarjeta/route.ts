import { NextRequest, NextResponse } from "next/server";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { compartirTarjetaOneclick } from "@/lib/dataAccess/oneclick";
import { normPlate } from "@/lib/helpers";
import { migrarDeWooCommerceLegacy } from "@/lib/pagos";

export const runtime = "nodejs";

// "Usar en mis otros autos": deja la tarjeta ya inscrita de una patente
// cobrando también los demás vehículos de la cuenta, sin volver a pasar por
// Transbank (ver compartirTarjetaOneclick). Antes de esto, la persona con 3
// autos tenía que inscribir la misma tarjeta 3 veces.
//
// Los destinos NO vienen del body: se resuelven acá desde la sesión, así el
// único parámetro del cliente es de qué auto sale la tarjeta y no hay forma
// de copiarla a una patente ajena. Igual se verifica que el origen sea suyo.
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

  const patenteOrigen = normPlate(body.patente);
  const misClientes = await getClientesByIds(sesion.clienteIds);
  const misPatentes = misClientes.map((c) => normPlate(c.patente));
  if (!misPatentes.includes(patenteOrigen)) {
    return NextResponse.json({ ok: false, error: "Ese vehículo no está en tu cuenta" }, { status: 404 });
  }

  const destinos = misPatentes.filter((p) => p !== patenteOrigen);
  if (!destinos.length) {
    return NextResponse.json({ ok: false, error: "No tienes otros vehículos en la cuenta" }, { status: 400 });
  }

  const copiadas = await compartirTarjetaOneclick(patenteOrigen, destinos);
  if (!copiadas.length) {
    return NextResponse.json(
      { ok: false, error: "No hay ningún auto al que copiarla: o ya tienen tarjeta propia, o esta no está activa." },
      { status: 400 }
    );
  }
  // Cada auto que queda cobrando por Oneclick tiene que dejar de cobrarse por
  // WooCommerce, igual que si hubiera inscrito su propia tarjeta en
  // /inscripcion/retorno: sin esto el cron nuevo y el viejo le cobran el mismo
  // mes (ver migrarDeWooCommerceLegacy).
  for (const patente of copiadas) {
    migrarDeWooCommerceLegacy(
      misClientes.find((c) => normPlate(c.patente) === patente),
      patente
    );
  }
  return NextResponse.json({ ok: true, patentes: copiadas });
}
