import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import { crearSesionCliente, leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { normPlate } from "@/lib/helpers";

export const runtime = "nodejs";

// "Eliminar" acá es desvincular la patente de esta cuenta (limpiar
// clientes.email), no borrar el vehículo/cliente real: ese registro sigue
// existiendo con su plan, historial de ventas y suscripción Oneclick intactos
// (clientes.email no es único — ver buscarClientesPorEmail — así que esto
// solo saca esa fila de qué patentes resuelve ese correo). Un borrado de
// verdad además arrastraría en cascada las ventas del cliente (onDelete:
// cascade en ventas.clienteId), algo que no debe poder gatillar el propio
// cliente desde acá.
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

  await getDb().update(clientes).set({ email: null }).where(eq(clientes.id, objetivo.id));

  // La sesión guarda la lista de clienteIds firmada en la cookie (ver
  // clienteSession.ts): sin re-firmarla acá con el id ya afuera, este mismo
  // vehículo seguiría apareciendo en "Mis vehículos" hasta el próximo login.
  const clienteIdsRestantes = sesion.clienteIds.filter((id) => id !== objetivo.id);
  await crearSesionCliente(clienteIdsRestantes, sesion.email);

  return NextResponse.json({ ok: true });
}
