"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { esEstadoPagadoEgreso } from "@/lib/helpers";
import type { MovimientoContable, PagoInfo } from "@/types";

// Listado de Movimientos Contables de un tipo (ingreso/egreso): filtro por
// búsqueda, totales del período, cierre de caja diario (solo ingresos), y
// las acciones de estado/eliminación de cada fila.
export function useMovimientosContablesList(tipo: MovimientoContable["tipo"]) {
  const { data, commit, patchUi } = useApp();
  const [busqueda, setBusqueda] = useState("");

  const items = data.movimientosContables
    .filter((m) => m.tipo === tipo)
    .filter((m) => {
      const q = busqueda.toLowerCase().trim();
      if (!q) return true;
      return (
        m.descripcion.toLowerCase().includes(q) ||
        (m.categoria || "").toLowerCase().includes(q) ||
        (m.contraparte || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const total = items.reduce((s, m) => s + m.monto, 0);
  const totalPagado = items
    .filter((m) => (tipo === "egreso" ? m.estado === "pagado_cc" || m.estado === "pagado_efectivo" : m.estado === "pagado"))
    .reduce((s, m) => s + m.monto, 0);
  const totalXRendir = items.filter((m) => m.estado === "x_rendir").reduce((s, m) => s + m.monto, 0);
  const totalPendiente = items
    .filter((m) => m.estado === (tipo === "egreso" ? "pendiente_pago" : "pendiente"))
    .reduce((s, m) => s + m.monto, 0);

  const cierreDiario =
    tipo === "ingreso"
      ? Object.values(
          items.reduce<Record<string, { dia: string; cantidad: number; efectivo: number; tarjeta: number; transferencia: number; pendiente: number; total: number }>>(
            (acc, m) => {
              const dia = m.fecha.slice(0, 10);
              if (!acc[dia]) acc[dia] = { dia, cantidad: 0, efectivo: 0, tarjeta: 0, transferencia: 0, pendiente: 0, total: 0 };
              acc[dia].cantidad += 1;
              acc[dia].total += m.monto;
              if (m.estado === "pagado") {
                if (m.metodoPago === "efectivo") acc[dia].efectivo += m.monto;
                else if (m.metodoPago === "tarjeta") acc[dia].tarjeta += m.monto;
                else if (m.metodoPago === "transferencia") acc[dia].transferencia += m.monto;
              } else {
                acc[dia].pendiente += m.monto;
              }
              return acc;
            },
            {}
          )
        ).sort((a, b) => (a.dia < b.dia ? 1 : -1))
      : [];

  const toggleEstado = (m: MovimientoContable) => {
    if (m.estado === "pagado") {
      const actualizado: MovimientoContable = { ...m, estado: "pendiente", metodoPago: undefined, fechaPago: undefined };
      commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? actualizado : x)) });
      return;
    }
    patchUi({
      modal: {
        type: "pago",
        monto: m.monto,
        descripcion: m.descripcion,
        onConfirm: (pago: PagoInfo) => {
          // Ver fechaEfectiva: sin fechaPago el Flujo de Caja tendría que
          // asumir que la plata entró el día de la venta.
          const actualizado: MovimientoContable = {
            ...m,
            estado: "pagado",
            metodoPago: pago.metodo,
            fechaPago: new Date().toISOString(),
          };
          commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? actualizado : x)) });
        },
      },
    });
  };

  const cambiarEstadoEgreso = (m: MovimientoContable, nuevoEstado: MovimientoContable["estado"]) => {
    const fechaPago = esEstadoPagadoEgreso(nuevoEstado) ? new Date().toISOString() : undefined;
    commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? { ...x, estado: nuevoEstado, fechaPago } : x)) });
  };

  const eliminar = (m: MovimientoContable) => {
    commit({ movimientosContables: data.movimientosContables.filter((x) => x.id !== m.id) });
  };

  return {
    busqueda,
    setBusqueda,
    items,
    total,
    totalPagado,
    totalXRendir,
    totalPendiente,
    cierreDiario,
    toggleEstado,
    cambiarEstadoEgreso,
    eliminar,
  };
}
