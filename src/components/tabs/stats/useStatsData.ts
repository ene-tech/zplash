"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { patentesConOneclickActiva } from "@/lib/serverActions";
import { GLOSA_LAVADO_WEB, IDS_PROMOS_LAVADOS, LAVADO_EXTRA_PLAN_TIPO, LAVADO_UNICO_WEB_KEY, PROMOS_LAVADOS, PROMO_RECOMPRA_2_KEY, PROMO_VIP_KEY, SOLO_TUNEL_KEY, TIPOS_VENTA_PLAN, UPGRADE_DESCUENTO_KEY, UPGRADE_PACK_KEY, inRange, normPlate, periodoPlan, planStatus, primerDiaMesActualYMD, todayStr, todayYMD } from "@/lib/helpers";
import type { AppData, Cliente } from "@/types";
import { calcularFilasVentaCierre } from "../cierre/filasVenta";

// Calcula todos los datos derivados del dashboard de Estadísticas: el
// resumen global (planes vigentes/vencidos), el resumen del período
// seleccionado (composición de ingresos y monto vendido por tipo), y el uso
// de planes (promedio de pasadas, distribución, ranking top/bottom 10).
export function useStatsData() {
  const { data, ui, patchUi } = useApp();

  // Vigentes con renovación automática: Oneclick activa o suscripción Woo viva
  // (los dos "ok" de estadoRenovacion). Oneclick no viaja en AppData, se pide
  // aparte; null mientras carga.
  const [patentesOneclick, setPatentesOneclick] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelado = false;
    patentesConOneclickActiva().then((ps) => {
      if (!cancelado) setPatentesOneclick(new Set(ps.map(normPlate)));
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const desde = ui.statsDesde || primerDiaMesActualYMD();
  const hasta = ui.statsHasta || todayYMD();
  const hoy = todayStr();
  // Todo el dashboard recorre clientes, ingresos, ventas y cupones completos:
  // sin memo eso se repetía con cualquier patchUi (abrir un modal, tipear en
  // otro lado), no solo al cambiar los datos o el período.
  const stats = useMemo(
    () => calcularStats(data, desde, hasta, patentesOneclick, hoy),
    [data, desde, hasta, patentesOneclick, hoy]
  );
  return { data, patchUi, ...stats };
}

function calcularStats(data: AppData, desde: string, hasta: string, patentesOneclick: Set<string> | null, hoy: string) {
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

  const vigentesRenovacionAuto = patentesOneclick
    ? vigentes.filter((c) => patentesOneclick.has(normPlate(c.patente)) || !!c.renovacionAutoWooDesde).length
    : null;

  // --- Resumen por período (fechas seleccionables) ---
  const cuponPorCodigo = new Map(data.cupones.map((c) => [c.codigo, c]));
  const cuponValor = (cuponCodigo: string | undefined) => (cuponCodigo && cuponPorCodigo.get(cuponCodigo)?.valor) || 0;

  // Las garantías (relavado gratis por reclamo) no se consideran en este resumen. Los ingresos con
  // glosa propia (p. ej. "Servicio de Detailing" de un detailing, ya cobrado como servicio adicional) sí
  // se cuentan, pero en su propio bucket: no son plan, ni lavado único, ni ticket. El canje de un
  // lavado único pagado online también lleva glosa, pero es una pasada de lavado único.
  const ingresosPeriodo = data.ingresos.filter((i) => inRange(i.fecha, desde, hasta) && !i.esGarantia);
  const esLavadoWeb = (i: (typeof ingresosPeriodo)[number]) => i.glosa === GLOSA_LAVADO_WEB;
  const conPlan = ingresosPeriodo.filter((i) => !i.viaCupon && !i.glosa && i.planEstadoAlIngreso !== "bad");
  const por9990 = ingresosPeriodo.filter((i) => !i.viaCupon && ((!i.glosa && i.planEstadoAlIngreso === "bad") || esLavadoWeb(i)));
  const ticketGratis = ingresosPeriodo.filter((i) => i.viaCupon && cuponValor(i.cuponCodigo) === 0);
  const ticketPagado = ingresosPeriodo.filter((i) => i.viaCupon && cuponValor(i.cuponCodigo) > 0);
  const limpiezasCompletas = ingresosPeriodo.filter((i) => !i.viaCupon && i.glosa && !esLavadoWeb(i));

  const totalPeriodo = ingresosPeriodo.length;
  const pct = (n: number) => (totalPeriodo ? ((n / totalPeriodo) * 100).toFixed(1) : "0.0") + "%";
  const pctTickets = pct(ticketGratis.length + ticketPagado.length);
  const pctPlanes = pct(conPlan.length);
  const pct9990 = pct(por9990.length);
  const pctLimpiezas = pct(limpiezasCompletas.length);

  // Monto vendido por categoría en el período: las mismas ventas que suman en
  // el Total de "Detalle de venta" del Cierre de Caja (ver
  // calcularFilasVentaCierre), repartidas por tipo, así el total cuadra con el
  // Cierre. Es lo cobrado en el período, no el valor de las pasadas: un plan
  // o un pack suma el día que se vendió, no cuando se usa (ticket gratis
  // nunca aporta), y el lavado único suma lo que se cobró de verdad (Solo
  // túnel, precio editado, web), no $9.990 fijo. Lo que no es túnel ni
  // servicio adicional (tienda, venta puntual, reembolsos, ingresos del
  // módulo Contabilidad) va a "Otros".
  const cierre = calcularFilasVentaCierre(data.ventas, data.clientes, data.movimientosContables, desde, hasta);
  // El lavado extra plan se grababa como "Lavado único" hasta el 26-oct-2026:
  // sigue en el mismo grupo para que los períodos se puedan comparar.
  const tiposLavadoUnico = new Set(["Lavado único", LAVADO_EXTRA_PLAN_TIPO, LAVADO_UNICO_WEB_KEY, SOLO_TUNEL_KEY, `${SOLO_TUNEL_KEY} (Web)`]);
  const tiposPacks = new Set(["Cupón Venta Empresa", UPGRADE_PACK_KEY, UPGRADE_DESCUENTO_KEY, PROMO_VIP_KEY, PROMO_RECOMPRA_2_KEY]);
  for (const id of IDS_PROMOS_LAVADOS) {
    tiposPacks.add(PROMOS_LAVADOS[id].key);
    tiposPacks.add(`${PROMOS_LAVADOS[id].key} (Web)`);
  }
  let montoPlanes = 0;
  let montoPor9990 = 0;
  let montoTickets = 0;
  let montoLimpiezas = 0;
  for (const v of cierre.ventasEnTotal) {
    const precio = v.precio || 0;
    // El tipo va antes que esServicioAdicional: un lavado único comprado
    // por el checkout web puede venir marcado como servicio adicional.
    if (TIPOS_VENTA_PLAN.has(v.tipo)) montoPlanes += precio;
    else if (tiposLavadoUnico.has(v.tipo)) montoPor9990 += precio;
    else if (tiposPacks.has(v.tipo)) montoTickets += precio;
    else if (v.esServicioAdicional) montoLimpiezas += precio;
  }
  const montoTotalPeriodo = cierre.totalMontoVentas;
  const montoOtros = montoTotalPeriodo - montoPlanes - montoPor9990 - montoTickets - montoLimpiezas;
  const pctMonto = (n: number) => (montoTotalPeriodo ? ((n / montoTotalPeriodo) * 100).toFixed(1) : "0.0") + "%";
  const pctMontoPlanes = pctMonto(montoPlanes);
  const pctMonto9990 = pctMonto(montoPor9990);
  const pctMontoTickets = pctMonto(montoTickets);
  const pctMontoLimpiezas = pctMonto(montoLimpiezas);
  const pctMontoOtros = pctMonto(montoOtros);

  // Valor promedio de una pasada por el túnel: lo vendido en planes, lavado
  // único y packs dividido por las pasadas de esos tres tipos (tickets gratis
  // incluidos, aportan $0). Quedan fuera los servicios adicionales y "Otros".
  const pasadasTunel = conPlan.length + por9990.length + ticketGratis.length + ticketPagado.length;
  const valorPromedioPasadaTunel = pasadasTunel ? (montoPlanes + montoPor9990 + montoTickets) / pasadasTunel : 0;

  // Ventas de plan pagadas con el QR del mesón (ver QrPlanConTarjeta), por
  // operador que lo mostró — ranking de monto, el que más vende primero.
  const ventasQr = data.ventas.filter((v) => v.operadorQr && inRange(v.fecha, desde, hasta));
  const porOperadorQr = new Map<string, { operador: string; ventas: number; monto: number }>();
  for (const v of ventasQr) {
    const fila = porOperadorQr.get(v.operadorQr!) ?? { operador: v.operadorQr!, ventas: 0, monto: 0 };
    fila.ventas += 1;
    fila.monto += v.precio || 0;
    porOperadorQr.set(v.operadorQr!, fila);
  }
  const rankingQr = [...porOperadorQr.values()].sort((a, b) => b.monto - a.monto || b.ventas - a.ventas);
  const montoQr = ventasQr.reduce((s, v) => s + (v.precio || 0), 0);
  const pctMontoQrDePlanes = (montoPlanes ? ((montoQr / montoPlanes) * 100).toFixed(1) : "0.0") + "%";

  // Packs de lavados (2 y 4 tickets): ventas del período por canal y el estado
  // de HOY de los tickets que esas ventas emitieron. Los tickets no guardan la
  // venta que los generó, así que se toman los del lote del pack creados en el
  // período (nacen en el mismo commit que la venta). Los del upgrade a Promo 4
  // Lavados caen en el lote de 4 tickets, por eso esas ventas se cuentan aparte.
  const ahora = new Date();
  const packsLavados = IDS_PROMOS_LAVADOS.map((id) => {
    const { key, lavados } = PROMOS_LAVADOS[id];
    const ventasPack = data.ventas.filter((v) => (v.tipo === key || v.tipo === `${key} (Web)`) && inRange(v.fecha, desde, hasta));
    const tickets = data.cupones.filter((c) => c.tipo === "vale" && c.nombreLote === key && inRange(c.creadoEn, desde, hasta));
    const usados = tickets.filter((c) => c.usado).length;
    const caducados = tickets.filter((c) => !c.usado && new Date(c.fechaCaducidad) <= ahora).length;
    return {
      id,
      lavados,
      ventas: ventasPack.length,
      ventasWeb: ventasPack.filter((v) => v.tipo.endsWith(" (Web)")).length,
      monto: ventasPack.reduce((s, v) => s + (v.precio || 0), 0),
      ticketsEmitidos: tickets.length,
      usados,
      pendientes: tickets.length - usados - caducados,
      caducados,
    };
  });
  const ventasUpgradePack = data.ventas.filter((v) => v.tipo.startsWith(UPGRADE_PACK_KEY) && inRange(v.fecha, desde, hasta));
  const upgradesPack = {
    ventas: ventasUpgradePack.length,
    monto: ventasUpgradePack.reduce((s, v) => s + (v.precio || 0), 0),
  };

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

  // Solo planes vigentes (incluye "Por vencer"): un cliente con el plan ya vencido no debe
  // diluir el promedio de pasadas — antes se contaba a cualquiera que alguna vez tuvo plan.
  const clientesConPlan = vigentes;
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

  // Clientes con plan vigente que renuevan por WooCommerce y llevan 7+ pasadas
  // en el ciclo que corre hoy: a esos se les corta el cobro sin aviso y
  // pierden el plan al vencer (ver evaluarReglasCorreoPorTopeIlimitado). No
  // depende del período elegido arriba, igual que el corte. "Es de Woo" se
  // mira por la marca o por la última venta de plan (id "wc-..."), porque el
  // corte limpia la marca y sin eso el cliente ya cortado desaparecería.
  const ultimaVentaPlan = new Map<string, { id: string; fecha: string }>();
  for (const v of data.ventas) {
    if (!v.clienteId || !TIPOS_VENTA_PLAN.has(v.tipo)) continue;
    const previa = ultimaVentaPlan.get(v.clienteId);
    if (!previa || v.fecha > previa.fecha) ultimaVentaPlan.set(v.clienteId, v);
  }
  const ciclosWoo = new Map<string, { cliente: Cliente; inicio: number; fin: number; cantidad: number }>();
  for (const c of vigentes) {
    if (!c.renovacionAutoWooDesde && !ultimaVentaPlan.get(c.id)?.id.startsWith("wc-")) continue;
    const { inicio, fin } = periodoPlan(c);
    ciclosWoo.set(c.id, { cliente: c, inicio: inicio.getTime(), fin: fin.getTime(), cantidad: 0 });
  }
  for (const i of data.ingresos) {
    const ciclo = i.clienteId ? ciclosWoo.get(i.clienteId) : undefined;
    const t = new Date(i.fecha).getTime();
    if (ciclo && t >= ciclo.inicio && t < ciclo.fin) ciclo.cantidad++;
  }
  const perdiendoPlanWoo = [...ciclosWoo.values()]
    .filter((x) => x.cantidad >= 7)
    .sort((a, b) => b.cantidad - a.cantidad || ordenNombre(a, b));

  return {
    ingresosHoy,
    vencidos,
    vencidosWeb,
    vencidosLocal,
    sinPlan,
    porVencer,
    vigentes,
    vigentesWeb,
    vigentesLocal,
    vigentesRenovacionAuto,
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
    montoOtros,
    montoTotalPeriodo,
    pctMontoPlanes,
    pctMonto9990,
    pctMontoTickets,
    pctMontoLimpiezas,
    pctMontoOtros,
    pasadasTunel,
    valorPromedioPasadaTunel,
    promedioLavadosDiariosPeriodo,
    ventasQrCantidad: ventasQr.length,
    montoQr,
    pctMontoQrDePlanes,
    rankingQr,
    packsLavados,
    upgradesPack,
    promedioVisitasPlan,
    clientesConPlan,
    filasDistribucion,
    top10,
    bottom10,
    perdiendoPlanWoo,
  };
}
