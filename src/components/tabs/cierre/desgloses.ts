import { esTarjetaWeb } from "@/lib/helpers";
import type { MovimientoContable, Venta } from "@/types";

// Desglosa un grupo de ventas de "Venta nueva web" por tipo de producto
// (Plan nuevo, Renovación, Lavado único, Aspirado, Servicio, Pack Empresa,
// etc.) en vez de por medio de pago: como todas estas ventas se cobran con
// tarjeta vía Transbank, un desglose por medio de pago siempre daría una
// sola fila y no diría nada — lo interesante acá es qué se vendió.
export function desglosePorTipoVenta(items: Venta[]) {
  const porTipo = new Map<string, Venta[]>();
  for (const v of items) {
    if (!porTipo.has(v.tipo)) porTipo.set(v.tipo, []);
    porTipo.get(v.tipo)!.push(v);
  }
  return Array.from(porTipo.entries())
    .map(([tipo, vs]) => ({
      metodo: tipo,
      cantidad: vs.reduce((s, v) => s + (v.cantidadItems ?? 1), 0),
      monto: vs.reduce((s, v) => s + (v.montoCobrado ?? v.precio ?? 0), 0),
    }))
    .sort((a, b) => b.monto - a.monto);
}

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
