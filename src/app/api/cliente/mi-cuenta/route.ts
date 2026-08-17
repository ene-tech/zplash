import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { citaServicios, citas, ingresos, precios, servicios, suscripcionesOneclick, ventas } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { aceptoPoliticas, getClientesByIds } from "@/lib/dataAccess/clientes";
import { getConfig } from "@/lib/dataAccess/config";
import { preciosFromRows } from "@/lib/dataAccess/precios";
import { calcularOfertasPlan, type OfertaPlan } from "@/lib/helpers";
import { ingresoFromRow } from "@/lib/dataAccess/ingresos";
import { ventaFromRow } from "@/lib/dataAccess/ventas";

export const runtime = "nodejs";

const LIMITE_COMPRAS = 20;

export async function GET() {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  // politicasAceptadas va por email y no por patente, así que también hay que
  // devolverlo en el early return de abajo: una cuenta sin vehículos igual
  // tiene que poder aceptar las políticas.
  const [clientesEncontrados, politicasOk] = await Promise.all([getClientesByIds(sesion.clienteIds), aceptoPoliticas(sesion.email)]);
  const patentes = clientesEncontrados.map((c) => c.patente);
  if (!patentes.length) {
    return NextResponse.json({
      tarjetas: [],
      detailing: [],
      compras: [],
      renovacionesLegacy: [],
      ofertas: {},
      politicasAceptadas: politicasOk,
    });
  }

  const db = getDb();

  const [comprasRows, citasRows, tarjetasRows, ventasClienteRows, ingresosClienteRows, config, preciosRows] = await Promise.all([
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
    // Solo tarjetas realmente registradas: "pendiente"/"pendiente_solo_tarjeta"
    // son intentos de inscripción a medio camino y "cancelada" es un intento
    // fallido — mostrarlas acá confunde al cliente (parece que su patente/plan
    // quedó cancelado, no que una inscripción de tarjeta falló).
    db
      .select()
      .from(suscripcionesOneclick)
      .where(and(inArray(suscripcionesOneclick.patente, patentes), inArray(suscripcionesOneclick.estado, ["activa", "suspendida"]))),
    // A diferencia de comprasRows (recortado a LIMITE_COMPRAS y solo para
    // mostrar el historial), estas dos van completas y por clienteId — las
    // usa calcularOfertasPlan más abajo para las promociones de plan (ver
    // @/lib/helpers/ofertasPlan).
    db.select().from(ventas).where(inArray(ventas.clienteId, sesion.clienteIds)),
    db.select().from(ingresos).where(inArray(ingresos.clienteId, sesion.clienteIds)),
    getConfig(),
    db.select().from(precios),
  ]);

  const preciosMap = preciosFromRows(preciosRows);
  const ventasPorCliente = ventasClienteRows.map(ventaFromRow);
  const ingresosPorCliente = ingresosClienteRows.map(ingresoFromRow);
  const ofertas: Record<string, OfertaPlan> = {};
  for (const c of clientesEncontrados) {
    const oferta = calcularOfertasPlan(
      c,
      ventasPorCliente.filter((v) => v.clienteId === c.id),
      ingresosPorCliente.filter((i) => i.clienteId === c.id),
      config,
      preciosMap
    );
    if (Object.keys(oferta).length) ofertas[c.patente] = oferta;
  }

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
      // Solo si hay un próximo cobro agendado la tarjeta está realmente
      // renovando algo automáticamente — inscribirla desde "Mis tarjetas" sin
      // un plan vigente la deja "activa" (guardada, lista para usarse) pero
      // sin ningún cobro programado, ver /inscripcion/retorno.
      proximoCobro: t.proximoCobro,
    })),
    // Clientes con renovación automática detectada en pedidos de WooCommerce
    // Subscriptions (ver renovacionAutoWooDesde) que todavía no tienen una
    // suscripción Oneclick propia activa — si ya migraron a esta app no hace
    // falta mostrarles también la tarjeta del sistema anterior.
    renovacionesLegacy: clientesEncontrados
      .filter((c) => c.renovacionAutoWooDesde && !tarjetasRows.some((t) => t.patente === c.patente && t.estado === "activa"))
      .map((c) => ({ patente: c.patente, desde: c.renovacionAutoWooDesde as string })),
    // Promociones de plan por patente (renovación anticipada, reactivación,
    // upgrade) — mismas que ve el Operador, ver @/lib/helpers/ofertasPlan.
    ofertas,
    politicasAceptadas: politicasOk,
  });
}
