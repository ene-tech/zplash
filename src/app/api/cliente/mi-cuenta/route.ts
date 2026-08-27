import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { citaServicios, citas, cupones, ingresos, precios, servicios, suscripcionesOneclick, ventas } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { aceptoPoliticas, getClientesByIds } from "@/lib/dataAccess/clientes";
import { getConfig } from "@/lib/dataAccess/config";
import { cuponFromRow } from "@/lib/dataAccess/cupones";
import { preciosFromRows } from "@/lib/dataAccess/precios";
import {
  beneficioCupon,
  calcularOfertasPlan,
  estadoCupon,
  inicioProximoPeriodoPlan,
  ofertaConCupon,
  pasesIncluidos,
  planVigente,
  visitasPeriodoPlan,
  type OfertaPlan,
} from "@/lib/helpers";
import { ingresoFromRow } from "@/lib/dataAccess/ingresos";
import { buscarCuponDescuentoPlan, yaTieneTicketReactivacion } from "@/lib/pagos";
import { ventaFromRow } from "@/lib/dataAccess/ventas";
import type { Cupon } from "@/types";

export const runtime = "nodejs";

const LIMITE_COMPRAS = 20;

// Tickets ("vale") y cupones de descuento atados a la cuenta por correo: los de
// un Pack Empresa comprado por web y los que el cliente sumó a mano en "Mis
// tickets y cupones" (ver /agregar-cupon). Se sirven desde acá y no desde el
// /api/empresa/tickets público justamente para poder mostrar el beneficio: ese
// endpoint se consulta por RUT/email sin sesión y a propósito no expone `valor`.
async function cuponesDeLaCuenta(email: string) {
  const filas = await getDb()
    .select()
    .from(cupones)
    .where(sql`lower(${cupones.email}) = ${email.trim().toLowerCase()}`)
    .orderBy(desc(cupones.creadoEn));
  return filas.map(cuponFromRow).map((c) => ({
    codigo: c.codigo,
    nombreLote: c.nombreLote,
    numeroLote: c.numeroLote,
    totalLote: c.totalLote,
    estado: estadoCupon(c).label,
    beneficio: beneficioCupon(c),
    // patenteUso solo existe una vez canjeado; hasta entonces se muestra la
    // patente a la que quedó atado el descuento (null = lo puede usar cualquiera).
    patente: c.patenteUso || c.patenteAsignada || null,
  }));
}

export async function GET() {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  // politicasAceptadas va por email y no por patente, así que también hay que
  // devolverlo en el early return de abajo: una cuenta sin vehículos igual
  // tiene que poder aceptar las políticas.
  const [clientesEncontrados, politicasOk, cuponesCuenta] = await Promise.all([
    getClientesByIds(sesion.clienteIds),
    aceptoPoliticas(sesion.email),
    cuponesDeLaCuenta(sesion.email),
  ]);
  const patentes = clientesEncontrados.map((c) => c.patente);
  if (!patentes.length) {
    return NextResponse.json({
      tarjetas: [],
      detailing: [],
      compras: [],
      renovacionesLegacy: [],
      ofertas: {},
      lavados: {},
      // Una cuenta sin vehículos igual puede tener tickets: el comprador de un
      // Pack Empresa no necesita tener patentes propias en ZPlash.
      cupones: cuponesCuenta,
      descuentos: {},
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

  // Cupón de descuento vigente por patente — el MISMO lookup que usan los dos
  // caminos que cobran un plan (ver buscarCuponDescuentoPlan): las tarjetas de
  // plan de Mi Cuenta anuncian el precio y disparan el cobro con ese mismo
  // número, así que tienen que mostrarlo ya rebajado.
  const cuponesPorPatente = new Map<string, Cupon>();
  for (const [patente, cupon] of await Promise.all(patentes.map(async (p) => [p, await buscarCuponDescuentoPlan(p)] as const))) {
    if (cupon) cuponesPorPatente.set(patente, cupon);
  }

  const preciosMap = preciosFromRows(preciosRows);
  const ventasPorCliente = ventasClienteRows.map(ventaFromRow);
  const ingresosPorCliente = ingresosClienteRows.map(ingresoFromRow);
  const ofertas: Record<string, OfertaPlan> = {};
  // Por patente con oferta de reactivación: todavía le queda el lavado full
  // túnel gratis de la promo (una sola vez por cliente, ver
  // otorgarTicketReactivacion). Lo emite el cobro contra la tarjeta guardada
  // (/api/cliente/mi-cuenta/cobrar-oferta), así que VehiculoCard solo lo
  // anuncia cuando además hay tarjeta activa.
  const ticketsReactivacion: Record<string, boolean> = {};
  // Pasadas usadas en el ciclo vigente, solo para planes con tope (X5 —
  // pasesIncluidos devuelve null para el ilimitado viejo y para sin plan, y
  // planVigente cubre al que renovó anticipado y todavía le corre el mes sin
  // tope que ya tenía comprado).
  const lavados: Record<string, { usados: number; incluidos: number; reponeEl: string }> = {};
  for (const c of clientesEncontrados) {
    const incluidos = pasesIncluidos(planVigente(c));
    if (incluidos !== null) {
      lavados[c.patente] = {
        usados: visitasPeriodoPlan(ingresosPorCliente, c),
        incluidos,
        reponeEl: inicioProximoPeriodoPlan(c).toISOString(),
      };
    }
    const oferta = calcularOfertasPlan(
      c,
      ventasPorCliente.filter((v) => v.clienteId === c.id),
      ingresosPorCliente.filter((i) => i.clienteId === c.id),
      config,
      preciosMap
    );
    if (Object.keys(oferta).length) ofertas[c.patente] = ofertaConCupon(oferta, cuponesPorPatente.get(c.patente));
    // Solo se pregunta por el ticket de la promo si hay reactivación que
    // ofrecer: es la única tarjeta que lo anuncia, y es una consulta más por
    // patente (ver yaTieneTicketReactivacion).
    if (oferta.reactivacion) {
      ticketsReactivacion[c.patente] = !(await yaTieneTicketReactivacion(c.patente, (c.email || sesion.email).trim().toLowerCase()));
    }
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
    ticketsReactivacion,
    lavados,
    cupones: cuponesCuenta,
    // Cupón que se está aplicando a las tarjetas de plan de cada patente, para
    // que el cliente vea de dónde sale el precio más bajo y no parezca un error.
    descuentos: Object.fromEntries([...cuponesPorPatente].map(([p, c]) => [p, { codigo: c.codigo, beneficio: beneficioCupon(c) }])),
    politicasAceptadas: politicasOk,
  });
}
