"use client";

import { useApp } from "@/context/AppContext";
import { registrarIngreso, renovarPlan } from "@/lib/logic";
import {
  PLANES,
  fmtCLP,
  fmtHora,
  isValidEmail,
  isValidTelefono,
  marcarDescuentoUsado,
  vencimientoAnclado,
  ventaPlanReciente,
  cicloPlanDesde,
} from "@/lib/helpers";
import type { AppData, Cliente, Cupon, PagoInfo, Venta } from "@/types";
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

// El operador no puede borrar ventas (deleteVentas exige "permisos" o
// "arqueo", ver @/lib/serverActions/ventas), así que el mensaje lo manda a
// pedir la corrección en vez de sugerirle algo que no va a poder hacer.
const msgPlanDuplicado = (venta: Venta): string =>
  `A este cliente ya se le vendió un plan hace instantes: "${venta.tipo}" por ${fmtCLP(venta.precio)} a las ${fmtHora(venta.fecha)}` +
  `${venta.creadoPor ? ` (${venta.creadoPor})` : ""}. No se puede vender otro: el cobro anterior ya le dejó el plan vigente, y un segundo ` +
  `le corre el vencimiento un mes de más. Si la venta anterior quedó mal, pídele a Administración que la corrija.`;

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
    // Todos estos precios llegan CON el cupón de descuento ya restado (ver
    // conCupon en useOperadorFoundResult): son los mismos números que muestran
    // los botones, así que acá no se recalcula ninguno.
    pPromo: number;
    pContratacion: number;
    precioAtrasado: number;
    precioReactivacion: number | undefined;
    precioUpgrade: number;
    ventaUpgrade: Venta | undefined;
    cuponDescuento: Cupon | undefined;
  }
) {
  const { data, ui, commit, patchUi } = useApp();
  const { pPromo, pContratacion, precioAtrasado, precioReactivacion, precioUpgrade, ventaUpgrade, cuponDescuento } = opts;

  // Quema el cupón ya restado del precio y le pone el sello a la venta que la
  // acción acaba de crear (siempre la primera de patch.ventas). Todo viaja en
  // el mismo commit que el resto del patch —igual que en
  // useIngresoActions.cobrarLavadoUnico—: si el guardado falla, el cupón no
  // queda quemado por una venta que no existe.
  const conDescuento = (patch: Partial<AppData>, cliente: Cliente): Partial<AppData> => {
    if (!cuponDescuento) return patch;
    const [venta, ...resto] = patch.ventas ?? [];
    const ahora = new Date().toISOString();
    return {
      ...patch,
      ...(venta ? { ventas: [{ ...venta, viaCupon: true, cuponCodigo: cuponDescuento.codigo }, ...resto] } : {}),
      cupones: data.cupones.map((x) =>
        x.id === cuponDescuento.id ? marcarDescuentoUsado(x, cliente.patente, ui.perfilActual?.nombre, ahora) : x
      ),
    };
  };

  // Si el precio con descuento queda en $0, no corresponde pedir método de
  // pago (el cliente no está pagando nada) — mismo criterio que en
  // useIngresoActions.cobrarLavadoUnico y useOperadorNotFoundResult.
  const pedirPago = (cliente: Cliente, monto: number, descripcion: string, onConfirm: (pago: PagoInfo) => void) => {
    // Bloqueo de plan duplicado. Va acá y no en cada acción porque las seis
    // pasan por este mismo paso, y da lo mismo cuál se haya cobrado primero:
    // la segunda venta de plan al mismo cliente dentro de la ventana es
    // siempre el clic de más (ver ventaPlanReciente en @/lib/helpers). El
    // backstop server-side está en insertVentas (@/lib/serverActions/ventas):
    // dos operadores en máquinas distintas no comparten este `data.ventas`.
    const reciente = ventaPlanReciente(data.ventas, cliente.id);
    if (reciente) {
      setGuardarErr(msgPlanDuplicado(reciente));
      return;
    }
    setGuardarErr("");
    if (monto <= 0) {
      onConfirm({ metodo: undefined });
      return;
    }
    patchUi({ modal: { type: "pago", monto, descripcion, onConfirm } });
  };

  const renovar = (cliente: Cliente = c) => {
    pedirPago(cliente, pPromo, `Renovación temprana del plan de ${cliente.nombre} a precio preferencial`, async (pago) => {
      const patch = conDescuento(renovarPlan(data, cliente, ui.perfilActual?.nombre, pPromo, pago), cliente);
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
    pedirPago(cliente, precioAtrasado, `Pago atrasado del plan de ${cliente.nombre} (mantiene su fecha de vencimiento)`, async (pago) => {
      const patch = conDescuento(renovarPlan(data, cliente, ui.perfilActual?.nombre, precioAtrasado, pago, "Renovación atrasada", true), cliente);
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
    pedirPago(cliente, precioReactivacion, `Reactivación promocional del plan de ${cliente.nombre} a precio preferencial`, async (pago) => {
      const patch = conDescuento(renovarPlan(data, cliente, ui.perfilActual?.nombre, precioReactivacion, pago, "Reactivación promocional"), cliente);
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

  // Cliente Web vencido porque le falló el cobro automático: el operador le
  // cobra el plan acá, al mismo precio que la web (precioAtrasado). Un precio
  // en $0 no se cobra —sería regalar el plan, mismo criterio que el upgrade
  // en useOperadorFoundResult—; la tarjeta tampoco se muestra en ese caso.
  const renovarWeb = (cliente: Cliente = c) => {
    if (precioAtrasado <= 0) return;
    pedirPago(cliente, precioAtrasado, `Renovación de plan Web para ${cliente.nombre} (${cliente.patente})`, async (pago) => {
      const nuevoVencimiento = vencimientoAnclado(cliente.fechaContratacion || cliente.vencimiento);
      // Misma migración al X5 que hace renovarPlan en el mesón: renovar deja
      // al cliente en el plan que se vende hoy, traiga el que traiga.
      const plan = PLANES[0];
      const updated: Cliente = { ...cliente, plan, vencimiento: nuevoVencimiento, ultimaRenovacion: new Date().toISOString() };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: cliente.id,
        patente: cliente.patente,
        nombre: cliente.nombre,
        plan,
        precio: precioAtrasado,
        tipo: "Renovación Web (manual)",
        fecha: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit(
        conDescuento({ clientes: data.clientes.map((x) => (x.id === cliente.id ? updated : x)), ventas: [venta, ...data.ventas] }, cliente)
      );
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
    // Siempre el plan que se vende hoy (X5), aunque el cliente tenga guardado
    // el ilimitado viejo: ese plan ya no se ofrece ni contratando ni
    // renovando.
    const plan = PLANES[0];
    // El mismo número que muestra el botón (ver pContratacion en
    // useOperadorFoundResult): valor de 1ra contratación si nunca tuvo plan, ya
    // con el cupón de descuento restado.
    const precio = pContratacion;
    pedirPago(cliente, precio, `Contratación de plan (${plan}) para ${cliente.nombre}`, async (pago) => {
      // El ciclo arranca hoy, así que vencimiento y contratación se escriben
      // juntos (ver cicloPlanDesde): sin la contratación, periodoPlan deduce mal
      // la ventana de pases del X5.
      const updated = { ...cliente, plan, ...cicloPlanDesde() };
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
      const ok = await commit(
        conDescuento({ clientes: data.clientes.map((x) => (x.id === cliente.id ? updated : x)), ventas: [venta, ...data.ventas] }, cliente)
      );
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      setGuardarErr("");
      updateResult(updated);
    });
  };

  // Convierte el lavado único recién pagado (ventaUpgrade) en la
  // contratación del Plan X5, cobrando solo el adicional. La
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
    pedirPago(cliente, precioUpgrade, `Upgrade a ${plan} para ${cliente.nombre} (adicional al lavado ya pagado)`, async (pago) => {
      const updated = { ...cliente, plan, ...cicloPlanDesde(new Date(ventaUpgrade.fecha)) };
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
      const ok = await commit(
        conDescuento(
          { clientes: data.clientes.map((x) => (x.id === cliente.id ? updated : x)), ventas: [ventaAdicional, ...data.ventas], ...patchIngreso },
          cliente
        )
      );
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
