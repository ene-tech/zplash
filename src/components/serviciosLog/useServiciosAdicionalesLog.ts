"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP, fmtTelefono, todayYMD, ymd } from "@/lib/helpers";
import type { Cita, Venta } from "@/types";

export const ESTADO_PAGO_TONE = { pagado: "ok", abono50: "warn", pendiente: "bad" } as const;

// Lógica del log de servicios adicionales registrados en un día: listado
// filtrado por fecha, teléfono del cliente (resuelto desde su ficha o, si no
// hay clienteId, desde la Cita ligada), editar/eliminar (solo Gerencia), y
// el cambio de status de la cita — que al pasar a "Retirado" cobra primero
// cualquier saldo pendiente.
export function useServiciosAdicionalesLog() {
  const { data, ui, commit, patchUi } = useApp();
  const [fechaLog, setFechaLog] = useState(todayYMD());

  const logList = data.ventas.filter((v) => v.esServicioAdicional && ymd(new Date(v.fecha)) === fechaLog);

  // Solo Gerencia (módulo "permisos", mismo criterio que PerfilesTab) puede
  // borrar o editar un servicio ya registrado: borrar es destructivo y
  // además elimina el pago Transbank asociado, si tuvo uno (ver deleteVentas
  // en dataAccess.ts); editar corrige datos ya guardados sin pasar por el
  // circuito normal de registro.
  const esGerencia = ui.perfilActual?.modulos.includes("permisos") || false;

  // El teléfono no vive en la Venta: se busca en la ficha del cliente y, si
  // no hay clienteId (venta sin cliente registrado), se cae al teléfono
  // guardado en la Cita creada junto con este servicio.
  const telefonoDe = (v: Venta) => {
    const cliente = v.clienteId ? data.clientes.find((c) => c.id === v.clienteId) : undefined;
    const telefono = cliente?.telefono || data.citas.find((c) => c.id === v.citaId)?.telefono;
    return telefono ? fmtTelefono(telefono) : "—";
  };

  const labelEstadoPago = (v: Venta) =>
    v.estadoPago === "pagado" ? "Pagado" : v.estadoPago === "abono50" ? `Abono ${fmtCLP(v.montoCobrado ?? 0)}` : "Por pagar";

  const editarServicio = (v: Venta) => {
    patchUi({ modal: { type: "servicioAdicional", data: v } });
  };

  const eliminarServicio = (v: Venta) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar el servicio de ${v.patente} (${v.nombre})? Esta acción no se puede deshacer y también elimina el pago asociado, si existe.`,
        onConfirm: () => {
          commit({ ventas: data.ventas.filter((x) => x.id !== v.id) });
        },
      },
    });
  };

  // Al retirar el vehículo (último paso del circuito) se cobra cualquier
  // saldo pendiente de las ventas ligadas a esa cita antes de aplicar el
  // cambio de status: si ya estaba todo pagado, se aplica directo.
  const cambiarStatusCita = (citaId: string, estado: Cita["estado"]) => {
    if (estado === "retirado") {
      const ventasCita = data.ventas.filter((v) => v.citaId === citaId);
      const totalPrecio = ventasCita.reduce((s, v) => s + v.precio, 0);
      const totalCobrado = ventasCita.reduce((s, v) => s + (v.montoCobrado ?? 0), 0);
      const saldo = totalPrecio - totalCobrado;
      if (saldo > 0) {
        patchUi({
          modal: {
            type: "pago",
            monto: saldo,
            descripcion: `Saldo pendiente — ${ventasCita[0]?.patente || ""}`,
            onConfirm: (pago) => {
              commit({
                ventas: data.ventas.map((v) =>
                  v.citaId === citaId ? { ...v, estadoPago: "pagado", montoCobrado: v.precio, metodoPago: pago.metodo } : v
                ),
                citas: data.citas.map((c) => (c.id === citaId ? { ...c, estado } : c)),
              });
            },
          },
        });
        return;
      }
    }
    commit({ citas: data.citas.map((c) => (c.id === citaId ? { ...c, estado } : c)) });
  };

  return {
    data,
    fechaLog,
    setFechaLog,
    logList,
    esGerencia,
    telefonoDe,
    labelEstadoPago,
    editarServicio,
    eliminarServicio,
    cambiarStatusCita,
  };
}
