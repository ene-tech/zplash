import { esVentaNuevaWeb, inRange, PLAN_X3, TIPO_VENTA_REEMBOLSO, TIPOS_VENTA_PLAN } from "@/lib/helpers";
import type { Cliente, MovimientoContable, Venta } from "@/types";
import { GRUPOS_CIERRE, PRODUCTOS_CIERRE, type GrupoCierre } from "./productos";

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
  // El Plan X3 se cobra solo por Oneclick y se graba con el mismo tipo que el
  // X5 ("Renovación automática (Oneclick)"): solo la columna plan lo
  // distingue. Va en su propia fila (más abajo) en vez de quedar escondido
  // dentro de "Venta nueva web".
  const esPlanX3Web = (v: Venta) => esVentaNuevaWeb(v.creadoPor) && v.plan === PLAN_X3 && !esReembolso(v);
  // Cobros del Plan X5 (y del Ilimitado antiguo) por la web propia: Oneclick
  // y Webpay. Se separan en "nuevo" = el primer cobro X5 web que tuvo
  // esa patente en toda la historia (las altas web no se graban como "Plan
  // nuevo", se graban igual que una renovación), y "renovación" = el resto.
  const esPlanWeb = (v: Venta) =>
    esVentaNuevaWeb(v.creadoPor) && TIPOS_VENTA_PLAN.has(v.tipo) && !esReembolso(v) && !esUpgradePlan(v) && !esNuevoClienteAdmin(v);
  const esPlanX5Web = (v: Venta) => esPlanWeb(v) && !esPlanX3Web(v);
  const primerCobroPlanWeb = new Map<string, Venta>();
  // Solo cobros del X5: quien venía del X3 y se pasa al X5 cuenta como X5 nuevo.
  for (const v of ventas) {
    if (!esPlanX5Web(v)) continue;
    const previo = primerCobroPlanWeb.get(v.patente);
    if (!previo || v.fecha < previo.fecha) primerCobroPlanWeb.set(v.patente, v);
  }
  const esPlanWebNuevo = (v: Venta) => primerCobroPlanWeb.get(v.patente)?.id === v.id;
  const ventaNuevaWebItems = ventasPeriodo.filter(
    (v) => esVentaNuevaWeb(v.creadoPor) && !esNuevoClienteAdmin(v) && !esUpgradePlan(v) && !esReembolso(v) && !esPlanX3Web(v) && !esPlanX5Web(v)
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
    grupo: "Servicios adicionales Locales" as GrupoCierre,
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
    grupo: "Ajustes" as GrupoCierre,
    label: "Ingreso por Módulo Contabilidad",
    cantidad: ingresosContablesPeriodo.length,
    monto: ingresosContablesPeriodo.reduce((s, m) => s + m.monto, 0),
    items: ingresosContablesPeriodo,
  };

  const ventaNuevaWebRow = {
    tipo: "venta-nueva-web",
    grupo: "Venta Nueva Web" as GrupoCierre,
    label: "Lavados y packs de tickets (Web)",
    cantidad: ventaNuevaWebItems.reduce((s, v) => s + (v.cantidadItems ?? 1), 0),
    monto: ventaNuevaWebItems.reduce((s, v) => s + (v.precio || 0), 0),
    items: ventaNuevaWebItems,
  };

  const planX5Items = ventasPeriodo.filter(esPlanX5Web);
  const planX5NuevoItems = planX5Items.filter(esPlanWebNuevo);
  const planX5RenovacionItems = planX5Items.filter((v) => !esPlanWebNuevo(v));
  const planX5NuevoRow = {
    tipo: "plan-x5-web-nuevo",
    grupo: "Venta Nueva Web" as GrupoCierre,
    label: "Plan X5 nuevo (primer cobro web)",
    cantidad: planX5NuevoItems.length,
    monto: planX5NuevoItems.reduce((s, v) => s + (v.precio || 0), 0),
    items: planX5NuevoItems,
  };
  const planX5RenovacionRow = {
    tipo: "plan-x5-web-renovacion",
    grupo: "Venta Nueva Web" as GrupoCierre,
    label: "Plan X5 renovación (cobro automático web)",
    cantidad: planX5RenovacionItems.length,
    monto: planX5RenovacionItems.reduce((s, v) => s + (v.precio || 0), 0),
    items: planX5RenovacionItems,
  };

  const planX3Items = ventasPeriodo.filter((v) => esPlanX3Web(v) && !esNuevoClienteAdmin(v) && !esUpgradePlan(v));
  const planX3Row = {
    tipo: "plan-x3-web",
    grupo: "Venta Nueva Web" as GrupoCierre,
    label: "Plan X3 (Web automático)",
    cantidad: planX3Items.length,
    monto: planX3Items.reduce((s, v) => s + (v.precio || 0), 0),
    items: planX3Items,
  };

  const upgradePlanItems = ventasPeriodo.filter(esUpgradePlan);
  const upgradePlanRow = {
    tipo: "upgrade-plan",
    grupo: "Planes Locales (histórico)" as GrupoCierre,
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
    grupo: "Ajustes" as GrupoCierre,
    label: "Reembolso",
    cantidad: reembolsoItems.length,
    monto: reembolsoItems.reduce((s, v) => s + (v.precio || 0), 0),
    items: reembolsoItems,
  };

  const filasVenta = [
    ...ventasPorTipo,
    serviciosAdicionalesRow,
    planX5NuevoRow,
    planX5RenovacionRow,
    planX3Row,
    ventaNuevaWebRow,
    upgradePlanRow,
    ...(reembolsoItems.length ? [reembolsosRow] : []),
    ingresoModuloContabilidadRow,
    // Ordenadas por subtítulo (GRUPOS_CIERRE); dentro de cada grupo queda el
    // orden de arriba (sort es estable).
  ].sort((a, b) => GRUPOS_CIERRE.indexOf(a.grupo) - GRUPOS_CIERRE.indexOf(b.grupo));
  const totalCantidadVentas = filasVenta.reduce((s, f) => s + f.cantidad, 0);
  const totalMontoVentas = filasVenta.reduce((s, f) => s + f.monto, 0);

  // Las ventas (no los movimientos contables) que suman en el Total, una vez
  // cada una: ninguna venta cae en dos filas.
  const ventasEnTotal: Venta[] = [
    ...ventasPorTipo.flatMap((f) => f.items),
    ...serviciosAdicionalesItemsBase,
    ...ventaNuevaWebItems,
    ...planX5Items,
    ...planX3Items,
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
