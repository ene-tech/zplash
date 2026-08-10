import { NextRequest, NextResponse } from "next/server";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { buscarClientePorPatente, getClientesByIds, actualizarPatentePendiente } from "@/lib/dataAccess/clientes";
import { PATENTE_FORMATO_MSG, isValidPatente, normPlate } from "@/lib/helpers";

export const runtime = "nodejs";

// Versión para el Portal Cliente de solicitarCambioPatente
// (@/lib/serverActions/clientes): mismo mecanismo diferido
// (clientes.patente_pendiente, ver resolverPatentePendiente en
// @/lib/helpers), pero gateado por la sesión de cliente (cookie OTP) en vez
// de tieneModulo("clientes") — acá quien pide el cambio es el propio dueño
// del vehículo, no un operador. Se aplica sola cuando el plan renueva a un
// período nuevo (ver upsertClientes, aplicarPagoAprobado y el webhook de
// pedidos de WooCommerce, que ahora también resuelve este campo).
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { patente?: string; nuevaPatente?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patenteActual = normPlate(body.patente);
  const clientesEncontrados = await getClientesByIds(sesion.clienteIds);
  const objetivo = clientesEncontrados.find((c) => normPlate(c.patente) === patenteActual);
  if (!objetivo) {
    return NextResponse.json({ ok: false, error: "Ese vehículo no está en tu cuenta" }, { status: 404 });
  }

  const nuevaPatente = normPlate(body.nuevaPatente);
  if (!isValidPatente(nuevaPatente)) {
    return NextResponse.json({ ok: false, error: PATENTE_FORMATO_MSG }, { status: 400 });
  }
  if (nuevaPatente === patenteActual) {
    return NextResponse.json({ ok: false, error: "Esa ya es tu patente actual." }, { status: 400 });
  }

  const otro = await buscarClientePorPatente(nuevaPatente);
  if (otro && otro.id !== objetivo.id) {
    return NextResponse.json({ ok: false, error: "Esa patente ya está registrada por otro cliente." }, { status: 409 });
  }

  const ok = await actualizarPatentePendiente(objetivo.id, nuevaPatente);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "No se pudo guardar la solicitud" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, patentePendiente: nuevaPatente });
}
