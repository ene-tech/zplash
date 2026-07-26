"use client";

import { fmtCLP, fmtDate } from "@/lib/helpers";
import type { Venta } from "@/types";

export function ServiciosAdicionalesPeriodoTabla({ items }: { items: Venta[] }) {
  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Servicios adicionales vendidos en el período</h3>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Servicios</th>
            <th>Cantidad</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <div className="empty">Sin servicios adicionales vendidos en este período</div>
              </td>
            </tr>
          ) : (
            items.map((v) => (
              <tr key={v.id}>
                <td>{fmtDate(v.fecha)}</td>
                <td className="plate-tag">{v.patente}</td>
                <td>{v.nombre}</td>
                <td>{v.tipo}</td>
                <td>{v.cantidadItems ?? 1}</td>
                <td>{fmtCLP(v.precio)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
