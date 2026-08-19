"use client";

import { useCallback, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { esTarjetaWeb, esVentaNuevaWeb, inRange, normPlate, todayYMD } from "@/lib/helpers";
import { PRODUCTOS_CIERRE } from "./productos";

// Los desgloses expandibles de cada fila (por medio de pago / por tipo de
// venta) viven en ./desgloses.ts — dominio propio, importado directo por la
// UI (DetalleVentaYMetodosPago), no por este hook.

// Calcula todos los datos derivados del reporte de Cierre de Caja para el
// período [desde, hasta]: ventas por producto, métodos de pago, facturas
// pendientes, servicios adicionales e ingresos — todo lo que las tablas de
// CierreTab necesitan, ya filtrado/agrupado.
export function useCierreData() {
  const { data, ui, patchUi, commit } = useApp();
  const desde = ui.cierreDesde || todayYMD();
  const hasta = ui.cierreHasta || todayYMD();
  const { ingresos, clientes, ventas, movimientosContables } = data;

  // Todo el bloque de abajo es O(ventas × clientes) en el peor caso
  // (facturaPendientesPeriodo hace un .filter() sobre `ventas` por cada
  // cliente con Factura) — sin memo se recalculaba completo en cada render
  // de CierreTab, incluido cada tecla de `ui.facturaSearch` (que vive fuera
  // de este bloque a propósito, ver más abajo, para no gatillar este cálculo
  // pesado solo por escribir en ese buscador).
  const periodo = useMemo(() => {
    const ingresosPeriodo = ingresos.filter((i) => inRange(i.fecha, desde, hasta));
    const nuevosPeriodo = clientes.filter((c) => inRange(c.creadoEn, desde, hasta));
    const ventasPeriodo = ventas.filter((v) => inRange(v.fecha, desde, hasta));
    const autosConPlan = ingresosPeriodo.filter((i) => i.planEstadoAlIngreso !== "bad").length;
    const sinPlan = ingresosPeriodo.length - autosConPlan;
    const autosConCupon = ingresosPeriodo.filter((i) => i.viaCupon).length;

    const clientesPorId = new Map(clientes.map((c) => [c.id, c]));
    const esNuevoClienteAdmin = (v: (typeof ventasPeriodo)[number]) =>
      v.tipo === "Plan nuevo" && clientesPorId.get(v.clienteId)?.creadoPor === "Administrador";

    // "Venta nueva web" = todo lo cobrado por la plataforma de venta propia
    // (checkout Webpay nativo + sus renovaciones Oneclick), a diferencia del
    // webhook de WooCommerce (wordpress.zplash.cl), que sigue corriendo aparte
    // y solo vende planes — ver esVentaNuevaWeb en helpers/ventas.ts. Se separa
    // ANTES de armar el resto de las filas para que "Plan nuevo (Web)" /
    // "Renovación (Web)" / "Servicios adicionales" / "Otros" (más abajo) solo
    // reflejen WooCommerce y no dupliquen estas ventas en dos filas a la vez.
    // Upgrade de un lavado único ya pagado a Plan X5, cobrado desde Mi
    // Cuenta (Webpay u Oneclick, ver aplicarUpgradePlan): tiene fila propia más
    // abajo. Antes quedaba escondido dentro de "Venta nueva web" y, si el cobro
    // fue Oneclick, caía directo en "Otros" — fila que se dibuja bajo el Total
    // y no suma en él, así que ese dinero aparecía en "Métodos de pago" pero no
    // en "Detalle de venta". El upgrade del módulo Operador no entra acá: se
    // registra con tipo "Plan nuevo" (ver usePlanActions.upgradeAPlan) y ya
    // suma en "Contratación de plan".
    const esUpgradePlan = (v: (typeof ventasPeriodo)[number]) => v.tipo.startsWith("Upgrade a Plan");
    const ventaNuevaWebItems = ventasPeriodo.filter((v) => esVentaNuevaWeb(v.creadoPor) && !esNuevoClienteAdmin(v) && !esUpgradePlan(v));
    const ventasPeriodoBase = ventasPeriodo.filter((v) => !esVentaNuevaWeb(v.creadoPor));

    const ventasPorTipo = PRODUCTOS_CIERRE.map((p) => {
      const items = ventasPeriodoBase.filter((v) => v.tipo === p.tipo && !esNuevoClienteAdmin(v));
      return { ...p, cantidad: items.length, monto: items.reduce((s, v) => s + (v.precio || 0), 0), items };
    });

    // La tabla informativa "Servicios adicionales vendidos en el período" (más
    // abajo en CierreTab) y el stat-card "Autos con servicios adicionales" no
    // suman al Total de "Detalle de venta" — ahí sí interesa ver TODOS los
    // servicios vendidos sin importar el canal, lavado único/aspirado/servicio
    // comprado por el checkout Webpay nativo incluido. La fila de esta misma
    // categoría dentro de "Detalle de venta" (serviciosAdicionalesRow, abajo)
    // en cambio usa la base sin "Venta nueva web" para no duplicar ese monto
    // en dos filas del mismo total.
    const serviciosAdicionalesItems = ventasPeriodo.filter((v) => v.esServicioAdicional);
    const autosServiciosAdicionales = new Set(serviciosAdicionalesItems.map((v) => `${v.patente}|${v.fecha}`)).size;
    const serviciosAdicionalesItemsBase = ventasPeriodoBase.filter((v) => v.esServicioAdicional);
    const serviciosAdicionalesRow = {
      tipo: "servicios-adicionales",
      label: "Servicios adicionales (detailing, tapiz, motor, chasis, etc.)",
      // Un registro puede combinar varios servicios en una sola fila (ver
      // cantidadItems en registrar() de ServiciosAdicionalesView) — se suma
      // cantidadItems en vez de contar filas para no subestimar cuántos
      // servicios se vendieron realmente.
      cantidad: serviciosAdicionalesItemsBase.reduce((s, v) => s + (v.cantidadItems ?? 1), 0),
      monto: serviciosAdicionalesItemsBase.reduce((s, v) => s + (v.precio || 0), 0),
      items: serviciosAdicionalesItemsBase,
    };

    // Los movimientos con `ventaId` se generaron automáticamente desde una
    // Venta (ver movimientoContableDesdeVenta en helpers.ts) y esa Venta ya se
    // cuenta en "Detalle de venta del período" más arriba — incluirlos acá
    // también los duplicaría. Esta fila queda solo para ingresos genuinamente
    // manuales (carga directa en Contabilidad → Ingresos, o "Crear ingreso"
    // desde conciliación bancaria para abonos sin venta asociada).
    const ingresosContablesPeriodo = movimientosContables.filter(
      (m) => m.tipo === "ingreso" && inRange(m.fecha, desde, hasta) && !m.ventaId
    );
    const ingresoModuloContabilidadRow = {
      tipo: "ingreso-modulo-contabilidad",
      label: "Ingreso por Módulo Contabilidad",
      cantidad: ingresosContablesPeriodo.length,
      monto: ingresosContablesPeriodo.reduce((s, m) => s + m.monto, 0),
      items: ingresosContablesPeriodo,
    };

    const ventaNuevaWebRow = {
      tipo: "venta-nueva-web",
      label: "Venta nueva web",
      cantidad: ventaNuevaWebItems.reduce((s, v) => s + (v.cantidadItems ?? 1), 0),
      monto: ventaNuevaWebItems.reduce((s, v) => s + (v.precio || 0), 0),
      items: ventaNuevaWebItems,
    };

    const upgradePlanItems = ventasPeriodo.filter(esUpgradePlan);
    const upgradePlanRow = {
      tipo: "upgrade-plan",
      label: "Upgrade a Plan X5 (sobre lavado único ya pagado)",
      cantidad: upgradePlanItems.length,
      monto: upgradePlanItems.reduce((s, v) => s + (v.precio || 0), 0),
      items: upgradePlanItems,
    };

    const filasVenta = [...ventasPorTipo, serviciosAdicionalesRow, ventaNuevaWebRow, upgradePlanRow, ingresoModuloContabilidadRow];
    const totalCantidadVentas = filasVenta.reduce((s, f) => s + f.cantidad, 0);
    const totalMontoVentas = filasVenta.reduce((s, f) => s + f.monto, 0);

    const modificacionesAdminItems = ventasPeriodo.filter(esNuevoClienteAdmin);
    const modificacionesAdmin = {
      tipo: "modificaciones-admin",
      label: "Modificación de planes desde perfil de administrador",
      cantidad: modificacionesAdminItems.length,
      monto: modificacionesAdminItems.reduce((s, v) => s + (v.precio || 0), 0),
      items: modificacionesAdminItems,
    };

    const tiposConocidos = new Set(PRODUCTOS_CIERRE.map((p) => p.tipo));
    const otrasVentas = ventasPeriodoBase.filter((v) => !tiposConocidos.has(v.tipo) && !v.esServicioAdicional && !esUpgradePlan(v));

    const cobrado = (v: (typeof ventasPeriodo)[number]) => v.montoCobrado ?? v.precio ?? 0;
    // Las modificaciones de plan desde el perfil de administrador no son una
    // venta real (no hay ingreso de dinero a caja) — quedan fuera de "Detalle
    // de venta" (filasVenta arriba) y por consistencia también deben quedar
    // fuera de "Métodos de pago".
    const ventasPeriodoConDinero = ventasPeriodo.filter((v) => !esNuevoClienteAdmin(v));
    const efectivoItems = ventasPeriodoConDinero.filter((v) => v.metodoPago === "efectivo");
    const tarjetaTransbankItems = ventasPeriodoConDinero.filter((v) => v.metodoPago === "tarjeta" && esTarjetaWeb(v.creadoPor));
    const tarjetaGetnetItems = ventasPeriodoConDinero.filter((v) => v.metodoPago === "tarjeta" && !esTarjetaWeb(v.creadoPor));
    const transferenciaItems = ventasPeriodoConDinero.filter((v) => v.metodoPago === "transferencia" && v.estadoPago !== "pendiente");
    const cuentasPorCobrarItems = ventasPeriodoConDinero.filter((v) => v.metodoPago === "transferencia" && v.estadoPago === "pendiente");
    const porPagarItems = ventasPeriodoConDinero.filter((v) => v.estadoPago === "pendiente" && v.metodoPago !== "transferencia");

    // "Ingreso por Módulo Contabilidad" (arriba) se suma al Total de "Detalle
    // de venta" completo, pagado o pendiente — antes esta tabla de "Métodos de
    // pago" no lo consideraba en absoluto (ni siquiera lo ya pagado), así que
    // los dos "Total" de esta pantalla podían no cuadrar entre sí sin ninguna
    // explicación. Acá se reparte cada movimiento contable de tipo ingreso
    // según su estado real: pagado → su método de pago, pendiente → Cuentas x
    // Cobrar (igual que una venta con transferencia pendiente).
    const contablesPagados = ingresosContablesPeriodo.filter((m) => m.estado === "pagado");
    const contablesPendientes = ingresosContablesPeriodo.filter((m) => m.estado !== "pagado");
    const contablesPorMetodo = (metodo: string) => contablesPagados.filter((m) => m.metodoPago === metodo);
    const contablesTarjetaTransbank = contablesPorMetodo("tarjeta").filter((m) => esTarjetaWeb(m.creadoPor));
    const contablesTarjetaGetnet = contablesPorMetodo("tarjeta").filter((m) => !esTarjetaWeb(m.creadoPor));

    const metodosPago = [
      {
        metodo: "Efectivo",
        cantidad: efectivoItems.length + contablesPorMetodo("efectivo").length,
        monto: efectivoItems.reduce((s, v) => s + cobrado(v), 0) + contablesPorMetodo("efectivo").reduce((s, m) => s + m.monto, 0),
      },
      {
        metodo: "Tarjetas Transbank",
        cantidad: tarjetaTransbankItems.length + contablesTarjetaTransbank.length,
        monto:
          tarjetaTransbankItems.reduce((s, v) => s + cobrado(v), 0) +
          contablesTarjetaTransbank.reduce((s, m) => s + m.monto, 0),
      },
      {
        metodo: "Tarjetas GETNET",
        cantidad: tarjetaGetnetItems.length + contablesTarjetaGetnet.length,
        monto:
          tarjetaGetnetItems.reduce((s, v) => s + cobrado(v), 0) + contablesTarjetaGetnet.reduce((s, m) => s + m.monto, 0),
      },
      {
        metodo: "Transferencia bancaria",
        cantidad: transferenciaItems.length + contablesPorMetodo("transferencia").length,
        monto:
          transferenciaItems.reduce((s, v) => s + cobrado(v), 0) +
          contablesPorMetodo("transferencia").reduce((s, m) => s + m.monto, 0),
      },
      {
        metodo: "Cuentas x Cobrar",
        cantidad: cuentasPorCobrarItems.length + contablesPendientes.length,
        monto:
          cuentasPorCobrarItems.reduce((s, v) => s + (v.precio || 0), 0) + contablesPendientes.reduce((s, m) => s + m.monto, 0),
      },
      ...(porPagarItems.length
        ? [{ metodo: "Por pagar", cantidad: porPagarItems.length, monto: porPagarItems.reduce((s, v) => s + (v.precio || 0), 0) }]
        : []),
    ];
    const totalCantidadMetodosPago = metodosPago.reduce((s, m) => s + m.cantidad, 0);
    const totalMontoMetodosPago = metodosPago.reduce((s, m) => s + m.monto, 0);

    const facturaPendientesPeriodo = (() => {
      const items = clientes
        .filter((c) => c.tipoDocumento === "Factura")
        .flatMap((c) => {
          const ventPeriodo = ventas.filter((v) => v.clienteId === c.id && v.tipo !== "Cupón Venta Empresa" && inRange(v.fecha, desde, hasta));
          const monto = ventPeriodo.reduce((s, v) => s + (v.precio || 0), 0);
          if (ventPeriodo.length === 0 || monto === 0) return [];
          return [{ cliente: c, monto, ventaIds: ventPeriodo.map((v) => v.id), allEmitida: ventPeriodo.every((v) => v.facturaEmitida) }];
        });

      const groups = new Map<string, typeof items>();
      for (const item of items) {
        const key = item.cliente.rut || item.cliente.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      return Array.from(groups.values())
        .map((group) => ({
          rut: group[0].cliente.rut || "",
          razonSocial: group[0].cliente.razonSocial || group[0].cliente.nombre,
          clientes: group,
          montoTotal: group.reduce((s, x) => s + x.monto, 0),
          ventaIdsTotal: group.flatMap((x) => x.ventaIds),
        }))
        .filter((g) => !g.clientes.every((x) => x.allEmitida));
    })();

    // Facturas pedidas directo en el checkout web (Pack Empresa, o desde
    // 2026-08 también Lavado único/Aspirado/servicio/plan vía PagoUnicoCard):
    // a diferencia de facturaPendientesPeriodo (arriba, que depende de un
    // Cliente con tipoDocumento="Factura" en su ficha), acá el dato es un
    // snapshot por venta que llega directo del checkout — ver
    // pagosWebpayItems y aplicarPagoAprobado/aplicarPagoPackEmpresa.
    const facturasEmpresaPeriodo = ventasPeriodo.filter((v) => v.tipoDocumento === "Factura" && !v.facturaEmitida);

    return {
      ingresosPeriodo,
      nuevosPeriodo,
      ventasPeriodo,
      autosConPlan,
      sinPlan,
      autosConCupon,
      filasVenta,
      totalCantidadVentas,
      totalMontoVentas,
      modificacionesAdmin,
      otrasVentas,
      metodosPago,
      totalCantidadMetodosPago,
      totalMontoMetodosPago,
      autosServiciosAdicionales,
      facturaPendientesPeriodo,
      facturasEmpresaPeriodo,
      serviciosAdicionalesItems,
      ingresosContablesPeriodo,
    };
  }, [ingresos, clientes, ventas, movimientosContables, desde, hasta]);

  const marcarEmitida = useCallback(
    (ventaIds: string[]) => {
      const updated = ventas.map((v) => (ventaIds.includes(v.id) ? { ...v, facturaEmitida: true } : v));
      commit({ ventas: updated });
    },
    [ventas, commit]
  );

  // Separado del useMemo de arriba a propósito: `ui.facturaSearch` cambia en
  // cada tecla del buscador de "Clientes con Factura" y no depende de nada
  // del período (desde/hasta) ni del resto de ventas/movimientos — recalcular
  // todo lo de arriba en cada tecla habría sido el mismo problema que se
  // acaba de resolver, solo que gatillado por otro input.
  const facturaFiltrados = useMemo(() => {
    const facturaSearch = (ui.facturaSearch || "").toLowerCase();
    return clientes
      .filter((c) => c.tipoDocumento === "Factura")
      .filter(
        (c) =>
          !facturaSearch ||
          (c.nombre || "").toLowerCase().includes(facturaSearch) ||
          (c.razonSocial || "").toLowerCase().includes(facturaSearch) ||
          (c.rut || "").toLowerCase().includes(facturaSearch) ||
          normPlate(c.patente).includes(normPlate(facturaSearch))
      );
  }, [clientes, ui.facturaSearch]);

  return {
    data,
    ui,
    patchUi,
    desde,
    hasta,
    ingresos,
    ventas,
    ...periodo,
    facturaFiltrados,
    marcarEmitida,
  };
}
