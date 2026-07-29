"use client";

import { useApp } from "@/context/AppContext";
import { registrarIngreso, renovarPlan } from "@/lib/logic";
import { PLANES, precioNormal, vencimientoAnclado, vencimientoPorDefectoISO } from "@/lib/helpers";
import type { Cliente, PagoInfo, Venta } from "@/types";
import { ERROR_GUARDADO_INGRESO } from "./useOperadorFoundResult";

// Acciones que cambian el plan del cliente: renovación anticipada a precio
// preferencial, reactivación promocional de un plan vencido, renovación
// manual de un cliente Web cuyo cobro automático falló, contratación de un
// plan nuevo, y el upgrade de un lavado único recién pagado a plan mensual.
export function usePlanActions(
  c: Cliente,
  setGuardarErr: (msg: string) => void,
  updateResult: (updated: Cliente) => void,
  opts: {
    pPromo: number;
    precioReactivacion: number | undefined;
    precioOfertaWeb: number;
    precioUpgrade: number;
    ventaUpgrade: Venta | undefined;
  }
) {
  const { data, ui, commit, patchUi } = useApp();
  const { pPromo, precioReactivacion, precioOfertaWeb, precioUpgrade, ventaUpgrade } = opts;

  // Si el precio con descuento queda en $0, no corresponde pedir método de
  // pago (el cliente no está pagando nada) — mismo criterio que en
  // useIngresoActions.cobrarLavadoUnico y useOperadorNotFoundResult.
  const pedirPago = (monto: number, descripcion: string, onConfirm: (pago: PagoInfo) => void) => {
    if (monto <= 0) {
      onConfirm({ metodo: undefined });
      return;
    }
    patchUi({ modal: { type: "pago", monto, descripcion, onConfirm } });
  };

  const renovar = (cliente: Cliente = c) => {
    pedirPago(pPromo, `Renovación temprana del plan de ${cliente.nombre} a precio preferencial`, async (pago) => {
      const patch = renovarPlan(data, cliente, ui.perfilActual?.nombre, pPromo, pago);
      const ok = await commit(patch);
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      setGuardarErr("");
      const updated = patch.clientes?.find((x) => x.id === cliente.id);
      if (updated) updateResult(updated);
    });
  };

  const reactivar = (cliente: Cliente = c) => {
    if (precioReactivacion === undefined) return;
    pedirPago(precioReactivacion, `Reactivación promocional del plan de ${cliente.nombre} a precio preferencial`, async (pago) => {
      const patch = renovarPlan(data, cliente, ui.perfilActual?.nombre, precioReactivacion, pago, "Reactivación promocional");
      const ok = await commit(patch);
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      setGuardarErr("");
      const updated = patch.clientes?.find((x) => x.id === cliente.id);
      if (updated) updateResult(updated);
    });
  };

  const renovarWeb = (cliente: Cliente = c) => {
    pedirPago(precioOfertaWeb, `Renovación de plan Web para ${cliente.nombre} (${cliente.patente})`, async (pago) => {
      const nuevoVencimiento = vencimientoAnclado(cliente.fechaContratacion || cliente.vencimiento);
      const updated: Cliente = { ...cliente, vencimiento: nuevoVencimiento, ultimaRenovacion: new Date().toISOString() };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: cliente.id,
        patente: cliente.patente,
        nombre: cliente.nombre,
        plan: cliente.plan || PLANES[0],
        precio: precioOfertaWeb,
        tipo: "Renovación Web (manual)",
        fecha: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit({
        clientes: data.clientes.map((x) => (x.id === cliente.id ? updated : x)),
        ventas: [venta, ...data.ventas],
      });
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      setGuardarErr("");
      updateResult(updated);
    });
  };

  const contratarPlan = (cliente: Cliente = c) => {
    const plan = cliente.plan || PLANES[0];
    const precio = precioNormal(data.precios, plan);
    pedirPago(precio, `Contratación de plan (${plan}) para ${cliente.nombre}`, async (pago) => {
      const updated = { ...cliente, vencimiento: vencimientoPorDefectoISO(), plan };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: cliente.id,
        patente: cliente.patente,
        nombre: cliente.nombre,
        plan,
        precio,
        tipo: "Plan nuevo",
        fecha: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit({
        clientes: data.clientes.map((x) => (x.id === cliente.id ? updated : x)),
        ventas: [venta, ...data.ventas],
      });
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      setGuardarErr("");
      updateResult(updated);
    });
  };

  // Convierte el lavado único recién pagado (ventaUpgrade) en la
  // contratación del Plan Ilimitado Mensual, cobrando solo el adicional. La
  // venta original del lavado único NO se toca: pudo quedar dentro de un
  // Cierre de Caja de un día ya reportado, y ese reporte no debe cambiar
  // retroactivamente (Cierre de Caja se calcula en vivo filtrando `ventas`
  // por fecha, ver useCierreData). El adicional se registra como una venta
  // nueva, fechada hoy (el día real del pago), con tipo "Plan nuevo" para que
  // Cierre de Caja y Estadísticas la reconozcan como "Contratación de plan".
  // El vencimiento del cliente sí se ancla a la fecha del lavado original
  // (no al momento del pago del upgrade), para que no pierda el tiempo
  // transcurrido dentro de la ventana de la promoción (ver
  // ConfigGlobal.horasVentanaUpgradePlan) — eso es un dato del plan, no un
  // monto de caja, así que no tiene el mismo problema.
  const upgradeAPlan = (cliente: Cliente = c) => {
    if (!ventaUpgrade) return;
    const plan = PLANES[0];
    // Si el upgrade se hace el mismo día del lavado único original, el
    // Ingreso ya registrado en cobrarLavadoUnico cubre el paso de hoy por el
    // túnel y no corresponde duplicarlo (por eso esta función normalmente no
    // toca `ingresos`). Si se hace un día distinto (la ventana permite hasta
    // varios días, ver ConfigGlobal.horasVentanaUpgradePlan), el cliente está
    // volviendo a pasar físicamente hoy y sí corresponde un Ingreso nuevo.
    const distintoDia = new Date(ventaUpgrade.fecha).toDateString() !== new Date().toDateString();
    pedirPago(precioUpgrade, `Upgrade a ${plan} para ${cliente.nombre} (adicional al lavado ya pagado)`, async (pago) => {
      const updated = { ...cliente, plan, vencimiento: vencimientoPorDefectoISO(new Date(ventaUpgrade.fecha)) };
      const ventaAdicional: Venta = {
        id: "v" + Date.now(),
        clienteId: cliente.id,
        patente: cliente.patente,
        nombre: cliente.nombre,
        plan,
        precio: precioUpgrade,
        tipo: "Plan nuevo",
        fecha: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const patchIngreso = distintoDia ? registrarIngreso(data, updated, ui.perfilActual?.nombre) : {};
      const ok = await commit({
        clientes: data.clientes.map((x) => (x.id === cliente.id ? updated : x)),
        ventas: [ventaAdicional, ...data.ventas],
        ...patchIngreso,
      });
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      setGuardarErr("");
      updateResult(updated);
    });
  };

  return { renovar, reactivar, renovarWeb, contratarPlan, upgradeAPlan };
}
