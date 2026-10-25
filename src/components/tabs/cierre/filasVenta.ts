import { esVentaNuevaWeb, inRange, TIPO_VENTA_REEMBOLSO } from "@/lib/helpers";
import type { Cliente, MovimientoContable, Venta } from "@/types";
import { PRODUCTOS_CIERRE } from "./productos";

// "Detalle de venta" del Cierre de Caja para el período [desde, hasta]: las
// filas y su Total. Vive aparte de useCierreData para que Estadísticas sume
// exactamente las mismas ventas y su "Monto total de venta" cuadre con el
// Cierre.
export function calcularFilasVentaCierre(
  ventas: Venta[],
  clientes: Cliente[],
  movimientosContables: MovimientoContable[],
  desde: string,
  hasta: string
) {
  const ventasPeriodo = ventas.filter((v) => inRange(v.fecha, desde, hasta));

  const clientesPorId = new Map(clientes.map((c) => [c.id, c]));
  const esNuevoClienteAdmin = (v: Venta) => v.tipo === "Plan nuevo" && clientesPorId.get(v.clienteId)?.creadoPor === "Administrador";

  // "Venta nueva web" = todo lo cobrado por la plataforma de venta propia
  // (checkout Webpay nativo + sus renovaciones Oneclick), a diferencia del
  // webhook de WooCommerce (wordpress.zplash.cl), que sigue corriendo aparte
  // y solo vende planes — ver esVentaNuevaWeb en helpers/ventas.ts. Se separa
  // ANTES de armar el resto de las filas para que "Plan nuevo (Web)" /
  // "Renovación (Web)" / "Servicios adicionales" / "Otros" (más abajo) solo
  // reflejen WooCommerce y no dupliquen estas ventas en dos filas a la vez.
  // Upgrade de un lavado único ya pagado a Plan X5, cobrado desde Mi
  // Cuenta (Webpay u Oneclick): tiene fila propia más
  // abajo. Antes quedaba escondido dentro de "Venta nueva web" y, si el cobro
  // fue Oneclick, caía directo en "Otros" — fila que se dibuja bajo el Total
  // y no suma en él, así que ese dinero aparecía en "Métodos de pago" pero no
  // en "Detalle de venta". El upgrade del módulo Operador también cae acá
  // ("Upgrade a Plan X5 (Local)"); los anteriores a sep-2026 quedaron como
  // "Plan nuevo" en "Contratación de plan". Solo ventas históricas: el
  // upgrade a plan se retiró en oct-2026 (lo reemplazó el upgrade a Promo 4
  // Lavados, que va como un pack más, ver PRODUCTOS_CIERRE).
  const esUpgradePlan = (v: Venta) => v.tipo.startsWith("Upgrade a Plan");
  // Los reembolsos tienen creadoPor "Automático (Reembolso)" (caen en
  // esVentaNuevaWeb) pero no son una venta: fila propia más abajo, con
  // monto negativo, en la fecha en que se devolvió la plata.
  const esReembolso = (v: Venta) => v.tipo === TIPO_VENTA_REEMBOLSO;
  const ventaNuevaWebItems = ventasPeriodo.filter(
    (v) => esVentaNuevaWeb(v.creadoPor) && !esNuevoClienteAdmin(v) && !esUpgradePlan(v) && !esReembolso(v)
  );
  const ventasPeriodoBase = ventasPeriodo.filter((v) => !esVentaNuevaWeb(v.creadoPor));

  const ventasPorTipo = PRODUCTOS_CIERRE.map((p) => {
    const items = ventasPeriodoBase.filter((v) => v.tipo === p.tipo && !esNuevoClienteAdmin(v));
    return {
      ...p,
      // Un ticket del POS puede llevar varias unidades del mismo producto:
      // se cuentan unidades, igual que en servicios adicionales y venta web.
      // Las demás filas tienen cantidadItems = 1 y no cambian.
      cantidad: items.reduce((s, v) => s + (v.cantidadItems ?? 1), 0),
      monto: items.reduce((s, v) => s + (v.precio || 0), 0),
      items,
    };
  });

  // La fila de servicios adicionales dentro de "Detalle de venta" usa la base
  // sin "Venta nueva web" para no duplicar ese monto en dos filas del mismo
  // total (la tabla informativa de CierreTab sí lista todos, ver
  // serviciosAdicionalesItems en useCierreData).
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
  const ingresosContablesPeriodo = movimientosContables.filter((m) => m.tipo === "ingreso" && inRange(m.fecha, desde, hasta) && !m.ventaId);
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
    label: "Upgrade a Plan X5 (sobre Lavado Tunel / Uso Aspirado ya pagado)",
    cantidad: upgradePlanItems.length,
    monto: upgradePlanItems.reduce((s, v) => s + (v.precio || 0), 0),
    items: upgradePlanItems,
  };

  // Devoluciones a la tarjeta hechas EN el período (la fecha del
  // contra-asiento es la del reembolso, no la de la venta original): monto
  // negativo, así que restan del Total. En "Métodos de pago" no necesitan
  // fila propia: entran solos restando en "Tarjetas Transbank" (metodoPago
  // "tarjeta" + esTarjetaWeb + precio negativo). Solo aparece la fila
  // cuando hubo alguno, para no ensuciar el reporte de todos los días.
  const reembolsoItems = ventasPeriodo.filter(esReembolso);
  const reembolsosRow = {
    tipo: "reembolsos",
    label: "Reembolso",
    cantidad: reembolsoItems.length,
    monto: reembolsoItems.reduce((s, v) => s + (v.precio || 0), 0),
    items: reembolsoItems,
  };

  const filasVenta = [
    ...ventasPorTipo,
    serviciosAdicionalesRow,
    ventaNuevaWebRow,
    upgradePlanRow,
    ...(reembolsoItems.length ? [reembolsosRow] : []),
    ingresoModuloContabilidadRow,
  ];
  const totalCantidadVentas = filasVenta.reduce((s, f) => s + f.cantidad, 0);
  const totalMontoVentas = filasVenta.reduce((s, f) => s + f.monto, 0);

  // Las ventas (no los movimientos contables) que suman en el Total, una vez
  // cada una: ninguna venta cae en dos filas.
  const ventasEnTotal: Venta[] = [
    ...ventasPorTipo.flatMap((f) => f.items),
    ...serviciosAdicionalesItemsBase,
    ...ventaNuevaWebItems,
    ...upgradePlanItems,
    ...reembolsoItems,
  ];

  return {
    ventasPeriodo,
    ventasPeriodoBase,
    esNuevoClienteAdmin,
    esUpgradePlan,
    esReembolso,
    ingresosContablesPeriodo,
    filasVenta,
    totalCantidadVentas,
    totalMontoVentas,
    ventasEnTotal,
  };
}
