"use client";

import { useApp } from "@/context/AppContext";
import { registrarIngreso, registrarIngresoDetailing, registrarIngresoLavadoWeb } from "@/lib/logic";
import { yaIngresoHoy, type EstadoReingresoPlan } from "@/lib/helpers";
import type { Cita, Cliente, Cupon, PagoInfo, Venta } from "@/types";
import { ERROR_GUARDADO_INGRESO } from "./useOperadorFoundResult";

// Acciones de "dar ingreso" al vehículo: la garantía/bloqueo de reingreso, el
// check-in de un servicio de Detailing ya vendido, el canje de un lavado
// único ya pagado desde /pagar, y el cobro de un lavado único presencial
// (con o sin cupón de descuento vigente).
export function useIngresoActions(
  c: Cliente,
  clearPlate: () => void,
  setGuardarErr: (msg: string) => void,
  opts: {
    estadoIngreso: EstadoReingresoPlan;
    citaDetailingPendiente: Cita | undefined;
    lavadoWebPendiente: Venta | undefined;
    cuponDescuentoVigente: Cupon | undefined;
    precioLavadoUnicoFinal: number;
  }
) {
  const { data, ui, commit, patchUi } = useApp();
  const { estadoIngreso, citaDetailingPendiente, lavadoWebPendiente, cuponDescuentoVigente, precioLavadoUnicoFinal } = opts;

  const hacerRegistro = async (esGarantia: boolean, cliente: Cliente) => {
    const patch = registrarIngreso(data, cliente, ui.perfilActual?.nombre, esGarantia);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrarDetailing = async (cliente: Cliente = c) => {
    if (!citaDetailingPendiente) return;
    const patch = registrarIngresoDetailing(data, cliente, citaDetailingPendiente, ui.perfilActual?.nombre);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrar = (cliente: Cliente = c) => {
    if (estadoIngreso === "garantia") {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `Vehiculo Ingreso hace menos de 24 horas. ¿Desea que pase nuevamente por garantía?`,
          confirmLabel: "Sí, ingresar por garantía",
          danger: false,
          onConfirm: () => hacerRegistro(true, cliente),
        },
      });
      return;
    }
    hacerRegistro(false, cliente);
  };

  // Compra un lavado único y da ingreso sin condicionar a plan/garantía —
  // usado tanto desde "Lavado Full Túnel" (plan no vigente) como desde el
  // botón de "comprar de todas formas" cuando el reingreso está bloqueado.
  const cobrarLavadoUnico = (cliente: Cliente = c) => {
    const precio = precioLavadoUnicoFinal;
    const confirmarCobro = async (pago: PagoInfo) => {
      const ahora = new Date().toISOString();
      const patch = registrarIngreso(data, cliente, ui.perfilActual?.nombre);
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: cliente.id,
        patente: cliente.patente,
        nombre: cliente.nombre,
        plan: cliente.plan || "",
        precio,
        tipo: "Lavado único",
        fecha: ahora,
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
        viaCupon: !!cuponDescuentoVigente,
        cuponCodigo: cuponDescuentoVigente?.codigo,
      };
      const ok = await commit({
        ...patch,
        ventas: [venta, ...data.ventas],
        ...(cuponDescuentoVigente
          ? {
              cupones: data.cupones.map((x) =>
                x.id === cuponDescuentoVigente.id
                  ? { ...cuponDescuentoVigente, usado: true, patenteUso: cliente.patente, fechaUso: ahora, operadorUso: ui.perfilActual?.nombre || "" }
                  : x
              ),
            }
          : {}),
      });
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      clearPlate();
      patchUi({ operResult: null });
    };
    // Con un cupón de 100% el precio queda en $0: el cliente no está pagando
    // nada, así que no corresponde pedirle un método de pago (ver el mismo
    // criterio en movimientoContableDesdeVenta, que tampoco genera un
    // movimiento contable para esta venta).
    if (precio <= 0) {
      confirmarCobro({ metodo: undefined });
      return;
    }
    patchUi({
      modal: {
        type: "pago",
        monto: precio,
        descripcion: `Lavado único para ${cliente.nombre} (${cliente.patente})`,
        onConfirm: confirmarCobro,
      },
    });
  };

  const registrarLavadoWeb = async (cliente: Cliente = c) => {
    if (!lavadoWebPendiente) return;
    const patch = registrarIngresoLavadoWeb(data, cliente, lavadoWebPendiente, ui.perfilActual?.nombre);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrarPagado = (cliente: Cliente = c) => {
    if (yaIngresoHoy(data.ingresos, cliente.id)) {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `Este cliente ya pasó una vez hoy. ¿Desea que pase nuevamente por garantía?`,
          confirmLabel: "Sí, ingresar por garantía",
          danger: false,
          onConfirm: () => hacerRegistro(true, cliente),
        },
      });
      return;
    }
    cobrarLavadoUnico(cliente);
  };

  return { registrar, registrarDetailing, registrarLavadoWeb, registrarPagado, cobrarLavadoUnico };
}
