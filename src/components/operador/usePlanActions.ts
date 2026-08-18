"use client";

import { useApp } from "@/context/AppContext";
import { registrarIngreso, renovarPlan } from "@/lib/logic";
import { PLANES, isValidEmail, isValidTelefono, precioContratacion, vencimientoAnclado, vencimientoPorDefectoISO } from "@/lib/helpers";
import type { Cliente, PagoInfo, Venta } from "@/types";
import { ERROR_GUARDADO_INGRESO } from "./useOperadorFoundResult";

// Sin correo no hay a quién mandarle el aviso automático de contratación (ver
// tipoEvento="venta_creada" + ReglaCorreo en Web Settings → Reglas Correo,
// que exige cliente.email o queda en error — ver ejecutarAccionReglaCorreo en
// @/lib/mailing/reglas/motor.ts): a diferencia del resto de las acciones del
// módulo Operador, contratar un plan exige teléfono y correo válidos sin
// excepción, ni siquiera para los perfiles exentos de la validación general
// (Administración/Gerencia, ver esExentoValidacionRegistroOperador) — esos
// perfiles solo están exentos para dar ingreso al túnel, no para vender un
// plan nuevo.
const faltanDatosContactoPlan = (cliente: Cliente): boolean =>
  !cliente.telefono || !isValidTelefono(cliente.telefono) || !cliente.email || !isValidEmail(cliente.email);

const MSG_FALTAN_DATOS_CONTACTO_PLAN =
  "Para contratar un plan, el cliente debe tener teléfono y correo válidos registrados (se usan para el aviso de contratación). Complétalos en la ficha antes de continuar.";

// Acciones que cambian el plan del cliente: renovación anticipada a precio
// preferencial, pago atrasado dentro de los días de gracia, reactivación
// promocional de un plan vencido hace más tiempo, renovación
// manual de un cliente Web cuyo cobro automático falló, contratación de un
// plan nuevo, y el upgrade de un lavado único recién pagado a plan mensual.
export function usePlanActions(
  c: Cliente,
  setGuardarErr: (msg: string) => void,
  updateResult: (updated: Cliente) => void,
  opts: {
    pPromo: number;
    precioAtrasado: number;
    precioReactivacion: number | undefined;
    precioOfertaWeb: number;
    precioUpgrade: number;
    ventaUpgrade: Venta | undefined;
  }
) {
  const { data, ui, commit, patchUi } = useApp();
  const { pPromo, precioAtrasado, precioReactivacion, precioOfertaWeb, precioUpgrade, ventaUpgrade } = opts;

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

  // Pago de un plan que se venció hace poco, dentro de los días de gracia
  // configurados (ver enPlazoDePagoPlan): no es una promoción ni una
  // contratación nueva, es la renovación de siempre cobrada tarde — mismo
  // precio (con su heredado, ver precioPlanCliente) y misma fecha de
  // vencimiento, que renovarPlan ancla al vencimiento original en vez de
  // arrancar un ciclo nuevo desde hoy.
  const pagarAtrasado = (cliente: Cliente = c) => {
    pedirPago(precioAtrasado, `Pago atrasado del plan de ${cliente.nombre} (mantiene su fecha de vencimiento)`, async (pago) => {
      const patch = renovarPlan(data, cliente, ui.perfilActual?.nombre, precioAtrasado, pago, "Renovación atrasada", true);
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
    if (faltanDatosContactoPlan(cliente)) {
      setGuardarErr(MSG_FALTAN_DATOS_CONTACTO_PLAN);
      return;
    }
    const plan = cliente.plan || PLANES[0];
    // Mismo cálculo que muestra el botón (ver pContratacion en
    // useOperadorFoundResult): valor de 1ra contratación si nunca tuvo plan.
    const precio = precioContratacion(data.precios, plan, cliente);
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
    if (faltanDatosContactoPlan(cliente)) {
      setGuardarErr(MSG_FALTAN_DATOS_CONTACTO_PLAN);
      return;
    }
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

  return { renovar, pagarAtrasado, reactivar, renovarWeb, contratarPlan, upgradeAPlan };
}
