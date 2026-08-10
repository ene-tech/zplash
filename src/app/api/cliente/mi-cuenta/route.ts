import { NextResponse } from "next/server";
import { desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { citaServicios, citas, servicios, suscripcionesOneclick, ventas } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";

export const runtime = "nodejs";

const LIMITE_COMPRAS = 20;

export async function GET() {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  const clientesEncontrados = await getClientesByIds(sesion.clienteIds);
  const patentes = clientesEncontrados.map((c) => c.patente);
  if (!patentes.length) {
    return NextResponse.json({ tarjetas: [], detailing: [], compras: [], renovacionesLegacy: [] });
  }

  const db = getDb();

  const [comprasRows, citasRows, tarjetasRows] = await Promise.all([
    db
      .select({ fecha: ventas.fecha, tipo: ventas.tipo, plan: ventas.plan, monto: ventas.precio, patente: ventas.patente })
      .from(ventas)
      .where(or(inArray(ventas.patente, patentes), inArray(ventas.clienteId, sesion.clienteIds)))
      .orderBy(desc(ventas.fecha))
      .limit(LIMITE_COMPRAS),
    db
      .select({ id: citas.id, patente: citas.patente, fechaHora: citas.fechaHora, estado: citas.estado })
      .from(citas)
      .where(or(inArray(citas.patente, patentes), inArray(citas.clienteId, sesion.clienteIds)))
      .orderBy(desc(citas.fechaHora)),
    db.select().from(suscripcionesOneclick).where(inArray(suscripcionesOneclick.patente, patentes)),
  ]);

  const citaIds = citasRows.map((c) => c.id);
  const serviciosPorCita = new Map<string, string[]>();
  if (citaIds.length) {
    const filas = await db
      .select({ citaId: citaServicios.citaId, nombre: servicios.nombre })
      .from(citaServicios)
      .innerJoin(servicios, eq(citaServicios.servicioId, servicios.id))
      .where(inArray(citaServicios.citaId, citaIds));
    for (const f of filas) {
      const lista = serviciosPorCita.get(f.citaId) ?? [];
      lista.push(f.nombre);
      serviciosPorCita.set(f.citaId, lista);
    }
  }

  return NextResponse.json({
    compras: comprasRows.map((v) => ({ fecha: v.fecha, tipo: v.plan || v.tipo, monto: v.monto, patente: v.patente })),
    detailing: citasRows.map((c) => ({
      id: c.id,
      patente: c.patente,
      fechaHora: c.fechaHora,
      estado: c.estado,
      servicios: serviciosPorCita.get(c.id) ?? [],
    })),
    tarjetas: tarjetasRows.map((t) => ({
      patente: t.patente,
      cardTipo: t.cardTipo,
      cardUltimosDigitos: t.cardUltimosDigitos,
      estado: t.estado,
    })),
    // Clientes con renovación automática detectada en pedidos de WooCommerce
    // Subscriptions (ver renovacionAutoWooDesde) que todavía no tienen una
    // suscripción Oneclick propia activa — si ya migraron a esta app no hace
    // falta mostrarles también la tarjeta del sistema anterior.
    renovacionesLegacy: clientesEncontrados
      .filter((c) => c.renovacionAutoWooDesde && !tarjetasRows.some((t) => t.patente === c.patente && t.estado === "activa"))
      .map((c) => ({ patente: c.patente, desde: c.renovacionAutoWooDesde as string })),
  });
}
