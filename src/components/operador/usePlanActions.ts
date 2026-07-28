"use client";

import { useApp } from "@/context/AppContext";
import { registrarIngreso, renovarPlan } from "@/lib/actions";
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

  const renovar = () => {
    pedirPago(pPromo, `Renovación temprana del plan de ${c.nombre} a precio preferencial`, async (pago) => {
      const patch = renovarPlan(data, c, ui.perfilActual?.nombre, pPromo, pago);
      const ok = await commit(patch);
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      setGuardarErr("");
      const updated = patch.clientes?.find((x) => x.id === c.id);
      if (updated) updateResult(updated);
    });
  };

  const reactivar = () => {
    if (precioReactivacion === undefined) return;
    pedirPago(precioReactivacion, `Reactivación promocional del plan de ${c.nombre} a precio preferencial`, async (pago) => {
      const patch = renovarPlan(data, c, ui.perfilActual?.nombre, precioReactivacion, pago, "Reactivación promocional");
      const ok = await commit(patch);
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      setGuardarErr("");
      const updated = patch.clientes?.find((x) => x.id === c.id);
      if (updated) updateResult(updated);
    });
  };

  const renovarWeb = () => {
    pedirPago(precioOfertaWeb, `Renovación de plan Web para ${c.nombre} (${c.patente})`, async (pago) => {
      const nuevoVencimiento = vencimientoAnclado(c.fechaContratacion || c.vencimiento);
      const updated: Cliente = { ...c, vencimiento: nuevoVencimiento, ultimaRenovacion: new Date().toISOString() };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: c.id,
        patente: c.patente,
        nombre: c.nombre,
        plan: c.plan || PLANES[0],
        precio: precioOfertaWeb,
        tipo: "Renovación Web (manual)",
        fecha: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit({
        clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)),
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

  const contratarPlan = () => {
    const plan = c.plan || PLANES[0];
    const precio = precioNormal(data.precios, plan);
    pedirPago(precio, `Contratación de plan (${plan}) para ${c.nombre}`, async (pago) => {
      const updated = { ...c, vencimiento: vencimientoPorDefectoISO(), plan };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: c.id,
        patente: c.patente,
        nombre: c.nombre,
        plan,
        precio,
        tipo: "Plan nuevo",
        fecha: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit({
        clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)),
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
  // contratación del Plan Ilimitado Mensual: se cobra solo el adicional y se
  // actualiza esa misma venta (en vez de crear una nueva) a "Plan nuevo", que
  // es el tipo que Cierre de Caja y Estadísticas ya reconocen como
  // "Contratación de plan". El vencimiento se ancla a la fecha del lavado
  // original (no al momento del pago del upgrade), para que el cliente no
  // pierda el tiempo transcurrido dentro de la ventana de la promoción (ver
  // ConfigGlobal.horasVentanaUpgradePlan).
  const upgradeAPlan = () => {
    if (!ventaUpgrade) return;
    const plan = PLANES[0];
    // Si el upgrade se hace el mismo día del lavado único original, el
    // Ingreso ya registrado en cobrarLavadoUnico cubre el paso de hoy por el
    // túnel y no corresponde duplicarlo (por eso esta función normalmente no
    // toca `ingresos`). Si se hace un día distinto (la ventana permite hasta
    // varios días, ver ConfigGlobal.horasVentanaUpgradePlan), el cliente está
    // volviendo a pasar físicamente hoy y sí corresponde un Ingreso nuevo.
    const distintoDia = new Date(ventaUpgrade.fecha).toDateString() !== new Date().toDateString();
    pedirPago(precioUpgrade, `Upgrade a ${plan} para ${c.nombre} (adicional al lavado ya pagado)`, async (pago) => {
      const updated = { ...c, plan, vencimiento: vencimientoPorDefectoISO(new Date(ventaUpgrade.fecha)) };
      const ventaActualizada: Venta = {
        ...ventaUpgrade,
        plan,
        precio: ventaUpgrade.precio + precioUpgrade,
        tipo: "Plan nuevo",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const patchIngreso = distintoDia ? registrarIngreso(data, updated, ui.perfilActual?.nombre) : {};
      const ok = await commit({
        clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)),
        ventas: data.ventas.map((v) => (v.id === ventaUpgrade.id ? ventaActualizada : v)),
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
