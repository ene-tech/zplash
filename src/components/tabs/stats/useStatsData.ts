"use client";

import { useApp } from "@/context/AppContext";
import { inRange, planStatus, primerDiaMesActualYMD, todayStr, todayYMD } from "@/lib/helpers";
import type { Cliente } from "@/types";

const TIPOS_VENTA_PLAN = new Set([
  "Plan nuevo",
  "Renovación preferencial",
  "Reactivación promocional",
  "Plan nuevo (Web)",
  "Renovación (Web)",
  "Renovación Web (manual)",
]);

// Calcula todos los datos derivados del dashboard de Estadísticas: el
// resumen global (planes vigentes/vencidos), el resumen del período
// seleccionado (composición de ingresos y monto vendido por tipo), y el uso
// de planes (promedio de pasadas, distribución, ranking top/bottom 10).
export function useStatsData() {
  const { data, ui, patchUi } = useApp();
  const hoy = todayStr();
  const ingresosHoy = data.ingresos.filter((i) => new Date(i.fecha).toDateString() === hoy).length;
  const vencidosList = data.clientes.filter((c) => planStatus(c).label === "Vencido");
  const vencidos = vencidosList.length;
  const vencidosWeb = vencidosList.filter((c) => c.origen === "WEB").length;
  const vencidosLocal = vencidos - vencidosWeb;
  const sinPlan = data.clientes.filter((c) => planStatus(c).label === "Sin plan").length;
  const porVencer = data.clientes.filter((c) => planStatus(c).cls === "warn").length;
  const vigentes = data.clientes.filter((c) => planStatus(c).cls !== "bad");
  const vigentesWeb = vigentes.filter((c) => c.origen === "WEB").length;
  const vigentesLocal = vigentes.length - vigentesWeb;

  // --- Resumen por período (fechas seleccionables) ---
  const desde = ui.statsDesde || primerDiaMesActualYMD();
  const hasta = ui.statsHasta || todayYMD();

  const cuponPorCodigo = new Map(data.cupones.map((c) => [c.codigo, c]));
  const cuponValor = (cuponCodigo: string | undefined) => (cuponCodigo && cuponPorCodigo.get(cuponCodigo)?.valor) || 0;

  // Las garantías (relavado gratis por reclamo) no se consideran en este resumen. Los ingresos con
  // glosa propia (p. ej. "Servicio de Detailing" de un detailing, ya cobrado como servicio adicional) sí
  // se cuentan, pero en su propio bucket: no son plan, ni $9.990, ni ticket.
  const ingresosPeriodo = data.ingresos.filter((i) => inRange(i.fecha, desde, hasta) && !i.esGarantia);
  const conPlan = ingresosPeriodo.filter((i) => !i.viaCupon && !i.glosa && i.planEstadoAlIngreso !== "bad");
  const por9990 = ingresosPeriodo.filter((i) => !i.viaCupon && !i.glosa && i.planEstadoAlIngreso === "bad");
  const ticketGratis = ingresosPeriodo.filter((i) => i.viaCupon && cuponValor(i.cuponCodigo) === 0);
  const ticketPagado = ingresosPeriodo.filter((i) => i.viaCupon && cuponValor(i.cuponCodigo) > 0);
  const limpiezasCompletas = ingresosPeriodo.filter((i) => !i.viaCupon && i.glosa);

  const totalPeriodo = ingresosPeriodo.length;
  const pct = (n: number) => (totalPeriodo ? ((n / totalPeriodo) * 100).toFixed(1) : "0.0") + "%";
  const pctTickets = pct(ticketGratis.length + ticketPagado.length);
  const pctPlanes = pct(conPlan.length);
  const pct9990 = pct(por9990.length);
  const pctLimpiezas = pct(limpiezasCompletas.length);

  // Monto vendido por categoría en el período. "Planes" no se calcula desde
  // conPlan (esos lavados van incluidos en un plan ya pagado antes, sin venta
  // asociada): se calcula desde data.ventas, sumando las ventas de
  // contratación/renovación de plan del período. $9.990 usa el precio fijo de
  // lavado único. Ticket gratis siempre aporta $0 (por eso no se suma aparte).
  // Limpiezas completas se vende en Servicios Adicionales, así que su monto
  // se busca en la Venta ligada por citaId, no en el Ingreso.
  const montoPlanes = data.ventas
    .filter((v) => TIPOS_VENTA_PLAN.has(v.tipo) && inRange(v.fecha, desde, hasta))
    .reduce((s, v) => s + (v.precio || 0), 0);
  const montoPor9990 = por9990.length * 9990;
  const montoTickets = ticketPagado.reduce((s, i) => s + cuponValor(i.cuponCodigo), 0);
  const ventaPorCitaId = new Map(data.ventas.filter((v) => v.citaId).map((v) => [v.citaId, v]));
  const montoLimpiezas = limpiezasCompletas.reduce((s, i) => s + (i.citaId ? ventaPorCitaId.get(i.citaId)?.precio || 0 : 0), 0);
  const montoTotalPeriodo = montoPlanes + montoPor9990 + montoTickets + montoLimpiezas;
  const pctMonto = (n: number) => (montoTotalPeriodo ? ((n / montoTotalPeriodo) * 100).toFixed(1) : "0.0") + "%";
  const pctMontoPlanes = pctMonto(montoPlanes);
  const pctMonto9990 = pctMonto(montoPor9990);
  const pctMontoTickets = pctMonto(montoTickets);
  const pctMontoLimpiezas = pctMonto(montoLimpiezas);

  // --- Uso de planes y ranking de clientes, según el período seleccionado arriba ---
  const clientesPorId = new Map(data.clientes.map((c) => [c.id, c]));
  const ingresosVisitasPeriodo = data.ingresos.filter((i) => inRange(i.fecha, desde, hasta));

  // Promedio diario de lavados en el período seleccionado. Si "hasta" llega hasta hoy o más
  // adelante, el fin del cálculo se acota a hoy para no contar días que todavía no transcurren.
  const finPeriodoTranscurrido = hasta < todayYMD() ? hasta : todayYMD();
  const diasPeriodo =
    Math.round((new Date(finPeriodoTranscurrido + "T00:00:00").getTime() - new Date(desde + "T00:00:00").getTime()) / 86400000) + 1;
  const promedioLavadosDiariosPeriodo = diasPeriodo > 0 ? ingresosVisitasPeriodo.length / diasPeriodo : 0;

  const visitasPorCliente = new Map<string, number>();
  ingresosVisitasPeriodo.forEach((i) => {
    if (!i.clienteId) return;
    visitasPorCliente.set(i.clienteId, (visitasPorCliente.get(i.clienteId) || 0) + 1);
  });

  const clientesConPlan = data.clientes.filter((c) => c.plan);
  const totalVisitasPlan = clientesConPlan.reduce((s, c) => s + (visitasPorCliente.get(c.id) || 0), 0);
  const promedioVisitasPlan = clientesConPlan.length ? totalVisitasPlan / clientesConPlan.length : 0;

  // Un cliente con plan que no pasó ni una vez en el período no genera ingresos, así que nunca
  // aparecería en el ranking: hay que sumarlo a mano con 0 pasadas para que el "top 10 que menos
  // han pasado" sea consistente con el promedio de arriba (que sí cuenta los 0).
  const clientesConPlanSinVisitas = clientesConPlan.filter((c) => !visitasPorCliente.has(c.id));
  const conVisitas = [
    ...Array.from(visitasPorCliente.entries())
      .map(([clienteId, cantidad]) => ({ cliente: clientesPorId.get(clienteId), cantidad }))
      .filter((x): x is { cliente: Cliente; cantidad: number } => !!x.cliente),
    ...clientesConPlanSinVisitas.map((cliente) => ({ cliente, cantidad: 0 })),
  ];

  const ordenNombre = (a: { cliente: Cliente }, b: { cliente: Cliente }) => a.cliente.nombre.localeCompare(b.cliente.nombre, "es");

  const top10 = [...conVisitas].sort((a, b) => b.cantidad - a.cantidad || ordenNombre(a, b)).slice(0, 10);
  const bottom10 = [...conVisitas].sort((a, b) => a.cantidad - b.cantidad || ordenNombre(a, b)).slice(0, 10);

  // Distribución de pasadas: cuántos clientes con plan pasaron exactamente N veces en el período,
  // y qué porcentaje representan sobre el total de clientes con plan.
  const distribucionVisitas = new Map<number, number>();
  clientesConPlan.forEach((c) => {
    const cantidad = visitasPorCliente.get(c.id) || 0;
    distribucionVisitas.set(cantidad, (distribucionVisitas.get(cantidad) || 0) + 1);
  });
  const filasDistribucion = Array.from(distribucionVisitas.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([cantidad, clientes]) => ({
      cantidad,
      clientes,
      pct: clientesConPlan.length ? ((clientes / clientesConPlan.length) * 100).toFixed(1) + "%" : "0.0%",
      pctPasadas: totalVisitasPlan ? (((cantidad * clientes) / totalVisitasPlan) * 100).toFixed(1) + "%" : "0.0%",
    }));

  return {
    data,
    patchUi,
    ingresosHoy,
    vencidos,
    vencidosWeb,
    vencidosLocal,
    sinPlan,
    porVencer,
    vigentes,
    vigentesWeb,
    vigentesLocal,
    desde,
    hasta,
    conPlan,
    por9990,
    ticketGratis,
    ticketPagado,
    limpiezasCompletas,
    pctTickets,
    pctPlanes,
    pct9990,
    pctLimpiezas,
    montoPlanes,
    montoPor9990,
    montoTickets,
    montoLimpiezas,
    montoTotalPeriodo,
    pctMontoPlanes,
    pctMonto9990,
    pctMontoTickets,
    pctMontoLimpiezas,
    promedioLavadosDiariosPeriodo,
    promedioVisitasPlan,
    clientesConPlan,
    filasDistribucion,
    top10,
    bottom10,
  };
}
