"use client";

import { useApp } from "@/context/AppContext";
import { esTarjetaWeb, inRange, normPlate, todayYMD } from "@/lib/helpers";
import type { MovimientoContable, Venta } from "@/types";

// Desglosa un grupo de ventas por método de pago, con la misma
// categorización que la tabla global "Métodos de pago" (transferencia
// pendiente → Cuentas x Cobrar, resto pendiente → Por pagar; tarjeta web vs.
// tarjeta local), pero acotado a las ventas que componen una sola fila de
// "Detalle de venta del período".
export function desglosePagoVentas(items: Venta[]) {
  const cobrado = (v: Venta) => v.montoCobrado ?? v.precio ?? 0;
  const efectivo = items.filter((v) => v.metodoPago === "efectivo");
  const tarjetaTransbank = items.filter((v) => v.metodoPago === "tarjeta" && esTarjetaWeb(v.creadoPor));
  const tarjetaGetnet = items.filter((v) => v.metodoPago === "tarjeta" && !esTarjetaWeb(v.creadoPor));
  const transferencia = items.filter((v) => v.metodoPago === "transferencia" && v.estadoPago !== "pendiente");
  const cuentasPorCobrar = items.filter((v) => v.metodoPago === "transferencia" && v.estadoPago === "pendiente");
  const porPagar = items.filter((v) => v.estadoPago === "pendiente" && v.metodoPago !== "transferencia");
  return [
    { metodo: "Efectivo", cantidad: efectivo.length, monto: efectivo.reduce((s, v) => s + cobrado(v), 0) },
    { metodo: "Tarjetas Transbank", cantidad: tarjetaTransbank.length, monto: tarjetaTransbank.reduce((s, v) => s + cobrado(v), 0) },
    { metodo: "Tarjetas GETNET", cantidad: tarjetaGetnet.length, monto: tarjetaGetnet.reduce((s, v) => s + cobrado(v), 0) },
    {
      metodo: "Transferencia bancaria",
      cantidad: transferencia.length,
      monto: transferencia.reduce((s, v) => s + cobrado(v), 0),
    },
    {
      metodo: "Cuentas x Cobrar",
      cantidad: cuentasPorCobrar.length,
      monto: cuentasPorCobrar.reduce((s, v) => s + (v.precio || 0), 0),
    },
    { metodo: "Por pagar", cantidad: porPagar.length, monto: porPagar.reduce((s, v) => s + (v.precio || 0), 0) },
  ].filter((f) => f.cantidad > 0);
}

// Misma idea que desglosePagoVentas pero para movimientos contables (fila
// "Ingreso por Módulo Contabilidad"), que usan su propio campo `estado` en
// vez de `estadoPago`.
export function desglosePagoContables(items: MovimientoContable[]) {
  const pagados = items.filter((m) => m.estado === "pagado");
  const pendientes = items.filter((m) => m.estado !== "pagado");
  const porMetodo = (metodo: string) => pagados.filter((m) => m.metodoPago === metodo);
  const tarjetaTransbank = porMetodo("tarjeta").filter((m) => esTarjetaWeb(m.creadoPor));
  const tarjetaGetnet = porMetodo("tarjeta").filter((m) => !esTarjetaWeb(m.creadoPor));
  return [
    { metodo: "Efectivo", cantidad: porMetodo("efectivo").length, monto: porMetodo("efectivo").reduce((s, m) => s + m.monto, 0) },
    { metodo: "Tarjetas Transbank", cantidad: tarjetaTransbank.length, monto: tarjetaTransbank.reduce((s, m) => s + m.monto, 0) },
    { metodo: "Tarjetas GETNET", cantidad: tarjetaGetnet.length, monto: tarjetaGetnet.reduce((s, m) => s + m.monto, 0) },
    {
      metodo: "Transferencia bancaria",
      cantidad: porMetodo("transferencia").length,
      monto: porMetodo("transferencia").reduce((s, m) => s + m.monto, 0),
    },
    { metodo: "Cuentas x Cobrar", cantidad: pendientes.length, monto: pendientes.reduce((s, m) => s + m.monto, 0) },
  ].filter((f) => f.cantidad > 0);
}

// Calcula todos los datos derivados del reporte de Cierre de Caja para el
// período [desde, hasta]: ventas por producto, métodos de pago, facturas
// pendientes, servicios adicionales e ingresos — todo lo que las tablas de
// CierreTab necesitan, ya filtrado/agrupado.
export function useCierreData() {
  const { data, ui, patchUi } = useApp();
  const desde = ui.cierreDesde || todayYMD();
  const hasta = ui.cierreHasta || todayYMD();
  const { ingresos, clientes, ventas, movimientosContables } = data;

  const ingresosPeriodo = ingresos.filter((i) => inRange(i.fecha, desde, hasta));
  const nuevosPeriodo = clientes.filter((c) => inRange(c.creadoEn, desde, hasta));
  const ventasPeriodo = ventas.filter((v) => inRange(v.fecha, desde, hasta));
  const autosConPlan = ingresosPeriodo.filter((i) => i.planEstadoAlIngreso !== "bad").length;
  const sinPlan = ingresosPeriodo.length - autosConPlan;
  const autosConCupon = ingresosPeriodo.filter((i) => i.viaCupon).length;

  const clientesPorId = new Map(clientes.map((c) => [c.id, c]));
  const esNuevoClienteAdmin = (v: (typeof ventasPeriodo)[number]) =>
    v.tipo === "Plan nuevo" && clientesPorId.get(v.clienteId)?.creadoPor === "Administrador";

  const PRODUCTOS = [
    { tipo: "Lavado único", label: "Lavado único" },
    { tipo: "Plan nuevo", label: "Contratación de plan" },
    { tipo: "Renovación preferencial", label: "Renovación temprana" },
    { tipo: "Reactivación promocional", label: "Reactivación promocional (plan vencido)" },
    { tipo: "Plan nuevo (Web)", label: "Contratación de plan (Web automático)" },
    { tipo: "Renovación (Web)", label: "Renovación de plan (Web automático)" },
    { tipo: "Cupón Venta Empresa", label: "Cupón Venta Empresa" },
  ];
  const ventasPorTipo = PRODUCTOS.map((p) => {
    const items = ventasPeriodo.filter((v) => v.tipo === p.tipo && !esNuevoClienteAdmin(v));
    return { ...p, cantidad: items.length, monto: items.reduce((s, v) => s + (v.precio || 0), 0), items };
  });

  const serviciosAdicionalesItems = ventasPeriodo.filter((v) => v.esServicioAdicional);
  const autosServiciosAdicionales = new Set(serviciosAdicionalesItems.map((v) => `${v.patente}|${v.fecha}`)).size;
  const serviciosAdicionalesRow = {
    tipo: "servicios-adicionales",
    label: "Servicios adicionales (detailing, tapiz, motor, chasis, etc.)",
    // Un registro puede combinar varios servicios en una sola fila (ver
    // cantidadItems en registrar() de ServiciosAdicionalesView) — se suma
    // cantidadItems en vez de contar filas para no subestimar cuántos
    // servicios se vendieron realmente.
    cantidad: serviciosAdicionalesItems.reduce((s, v) => s + (v.cantidadItems ?? 1), 0),
    monto: serviciosAdicionalesItems.reduce((s, v) => s + (v.precio || 0), 0),
    items: serviciosAdicionalesItems,
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

  const filasVenta = [...ventasPorTipo, serviciosAdicionalesRow, ingresoModuloContabilidadRow];
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

  const tiposConocidos = new Set(PRODUCTOS.map((p) => p.tipo));
  const otrasVentas = ventasPeriodo.filter((v) => !tiposConocidos.has(v.tipo) && !v.esServicioAdicional);

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

  const facturaPendientesPeriodo = clientes
    .filter((c) => c.tipoDocumento === "Factura")
    .map((c) => {
      const ventPeriodo = ventas.filter((v) => v.clienteId === c.id && inRange(v.fecha, desde, hasta));
      return { cliente: c, monto: ventPeriodo.reduce((s, v) => s + (v.precio || 0), 0), cantidad: ventPeriodo.length };
    })
    .filter((x) => x.cantidad > 0);

  const facturasEmpresaPeriodo = ventasPeriodo.filter(
    (v) => v.tipo === "Cupón Venta Empresa" && v.tipoDocumento === "Factura"
  );

  const facturaSearch = (ui.facturaSearch || "").toLowerCase();
  const facturaFiltrados = clientes
    .filter((c) => c.tipoDocumento === "Factura")
    .filter(
      (c) =>
        !facturaSearch ||
        (c.nombre || "").toLowerCase().includes(facturaSearch) ||
        (c.razonSocial || "").toLowerCase().includes(facturaSearch) ||
        (c.rut || "").toLowerCase().includes(facturaSearch) ||
        normPlate(c.patente).includes(normPlate(facturaSearch))
    );

  return {
    data,
    ui,
    patchUi,
    desde,
    hasta,
    ingresos,
    ventas,
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
    facturaFiltrados,
  };
}
