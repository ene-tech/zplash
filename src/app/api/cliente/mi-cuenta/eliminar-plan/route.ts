import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, suscripcionesOneclick } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { insertAuditoria } from "@/lib/dataAccess/auditoria";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { cancelarSuscripcionOneclick } from "@/lib/dataAccess/oneclick";
import { normPlate, sigueVigenteHoy } from "@/lib/helpers";

export const runtime = "nodejs";

// Dar de baja el plan de una patente desde Mi Cuenta ("Eliminar Plan"). A
// diferencia de quitar-vehiculo (que solo desvincula la patente de la
// cuenta), acá lo que se borra es el plan: la fila del cliente sigue
// existiendo, con su email, su historial de ventas y su patente — queda "Sin
// plan", igual que una patente que nunca contrató.
//
// Solo con el plan YA VENCIDO: mientras siga vigente el cliente pagó por esos
// días. Y un plan vencido se puede seguir pagando desde la misma tarjeta de
// Mi Cuenta (ver OfertaPlan.pagoVencido en @/lib/helpers/ofertasPlan), así
// que este botón es la salida explícita para quien decidió no seguir, no la
// única forma de salir del estado "Vencido".
//
// `fechaContratacion` se limpia junto con el plan a propósito: si el cliente
// vuelve más adelante, contratar tiene que darle 30 días completos y no un
// resto del ciclo viejo (ver vencimientoAnclado, que es lo que se aplica
// mientras esa fecha siga puesta).
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
  if (!objetivo.plan && !objetivo.vencimiento) {
    return NextResponse.json({ ok: false, error: "Ese vehículo no tiene un plan" }, { status: 400 });
  }
  if (sigueVigenteHoy(objetivo.vencimiento)) {
    return NextResponse.json({ ok: false, error: "Tu plan sigue vigente: puedes darlo de baja cuando venza" }, { status: 400 });
  }

  const db = getDb();
  await db
    .update(clientes)
    .set({ plan: null, vencimiento: null, fechaContratacion: null, precioPlanHeredado: null })
    .where(eq(clientes.id, objetivo.id));

  // El cron de /api/pagos/oneclick/cobrar cobra toda suscripción "activa" con
  // proximoCobro vencido sin mirar el estado del plan: sin dar de baja acá la
  // tarjeta guardada, el cliente que elimina su plan igual seguiría pagándolo.
  const suscripciones = await db
    .select({ id: suscripcionesOneclick.id })
    .from(suscripcionesOneclick)
    .where(and(eq(suscripcionesOneclick.patente, objetivo.patente), inArray(suscripcionesOneclick.estado, ["activa", "suspendida"])));
  for (const s of suscripciones) {
    await cancelarSuscripcionOneclick(s.id);
  }

  await insertAuditoria([
    {
      tabla: "clientes",
      registroId: objetivo.id,
      accion: "update",
      datosAnteriores: {
        plan: objetivo.plan,
        vencimiento: objetivo.vencimiento,
        fechaContratacion: objetivo.fechaContratacion,
        precioPlanHeredado: objetivo.precioPlanHeredado,
      },
      datosNuevos: { plan: null, vencimiento: null, fechaContratacion: null, precioPlanHeredado: null, motivo: "Eliminar Plan (Mi Cuenta)" },
      usuario: `cliente:${sesion.email}`,
    },
  ]);

  return NextResponse.json({ ok: true });
}
