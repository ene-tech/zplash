"use client";

import { fmtDate, tipoIngreso } from "@/lib/helpers";
import type { Ingreso } from "@/types";

export function DetalleIngresosTabla({ ingresosPeriodo }: { ingresosPeriodo: Ingreso[] }) {
  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Detalle de ingresos</h3>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Estado plan</th>
          </tr>
        </thead>
        <tbody>
          {ingresosPeriodo.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <div className="empty">Sin ingresos en este período</div>
              </td>
            </tr>
          ) : (
            ingresosPeriodo.map((i) => {
              const tipo = tipoIngreso(i);
              return (
                <tr key={i.id}>
                  <td>{fmtDate(i.fecha)}</td>
                  <td className="plate-tag">{i.patente}</td>
                  <td>{i.nombre}</td>
                  <td>
                    <span className={`status-pill ${tipo.cls}`}>{tipo.label}</span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </>
  );
}
