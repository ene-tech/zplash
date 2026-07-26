"use client";

import { useApp } from "@/context/AppContext";
import { registrarIngreso, registrarIngresoDetailing } from "@/lib/actions";
import { montoDescuento, precioLavadoUnico, yaIngresoHoy, type EstadoReingresoPlan } from "@/lib/helpers";
import type { Cita, Cliente, Cupon, Venta } from "@/types";
import { ERROR_GUARDADO_INGRESO } from "./useOperadorFoundResult";

// Acciones de "dar ingreso" al vehículo: la garantía/bloqueo de reingreso, el
// check-in de un servicio de Detailing ya vendido, y el cobro de un lavado
// único (con o sin cupón de descuento vigente).
export function useIngresoActions(
  c: Cliente,
  clearPlate: () => void,
  setGuardarErr: (msg: string) => void,
  opts: {
    estadoIngreso: EstadoReingresoPlan;
    citaDetailingPendiente: Cita | undefined;
    cuponDescuentoVigente: Cupon | undefined;
  }
) {
  const { data, ui, commit, patchUi } = useApp();
  const { estadoIngreso, citaDetailingPendiente, cuponDescuentoVigente } = opts;

  const hacerRegistro = async (esGarantia: boolean) => {
    const patch = registrarIngreso(data, c, ui.perfilActual?.nombre, esGarantia);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrarDetailing = async () => {
    if (!citaDetailingPendiente) return;
    const patch = registrarIngresoDetailing(data, c, citaDetailingPendiente, ui.perfilActual?.nombre);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrar = () => {
    if (estadoIngreso === "garantia") {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `Vehiculo Ingreso hace menos de 24 horas. ¿Desea que pase nuevamente por garantía?`,
          confirmLabel: "Sí, ingresar por garantía",
          danger: false,
          onConfirm: () => hacerRegistro(true),
        },
      });
      return;
    }
    hacerRegistro(false);
  };

  // Compra un lavado único y da ingreso sin condicionar a plan/garantía —
  // usado tanto desde "Lavado Full Túnel" (plan no vigente) como desde el
  // botón de "comprar de todas formas" cuando el reingreso está bloqueado.
  const cobrarLavadoUnico = () => {
    const precioBase = precioLavadoUnico(data.precios);
    const precio = cuponDescuentoVigente ? Math.max(0, precioBase - montoDescuento(cuponDescuentoVigente, precioBase)) : precioBase;
    patchUi({
      modal: {
        type: "pago",
        monto: precio,
        descripcion: `Lavado único para ${c.nombre} (${c.patente})`,
        onConfirm: async (pago) => {
          const ahora = new Date().toISOString();
          const patch = registrarIngreso(data, c, ui.perfilActual?.nombre);
          const venta: Venta = {
            id: "v" + Date.now(),
            clienteId: c.id,
            patente: c.patente,
            nombre: c.nombre,
            plan: c.plan || "",
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
                      ? { ...cuponDescuentoVigente, usado: true, patenteUso: c.patente, fechaUso: ahora, operadorUso: ui.perfilActual?.nombre || "" }
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
        },
      },
    });
  };

  const registrarPagado = () => {
    if (yaIngresoHoy(data.ingresos, c.id)) {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `Este cliente ya pasó una vez hoy. ¿Desea que pase nuevamente por garantía?`,
          confirmLabel: "Sí, ingresar por garantía",
          danger: false,
          onConfirm: () => hacerRegistro(true),
        },
      });
      return;
    }
    cobrarLavadoUnico();
  };

  return { registrar, registrarDetailing, registrarPagado, cobrarLavadoUnico };
}
