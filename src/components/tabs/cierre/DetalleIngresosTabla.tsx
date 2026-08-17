"use client";

import { useMemo } from "react";
import { fmtDate, fmtTelefono, normPlate, tipoIngreso } from "@/lib/helpers";
import type { Cliente, Ingreso } from "@/types";

export function DetalleIngresosTabla({
  ingresosPeriodo,
  clientes,
}: {
  ingresosPeriodo: Ingreso[];
  clientes: Cliente[];
}) {
  // El email y el teléfono no viven en el Ingreso: se resuelven contra la
  // ficha del cliente. El índice por patente es el respaldo para los ingresos
  // guardados sin clienteId (canjes de cupón anteriores a que el canje
  // exigiera registrar al cliente, ver registrarIngresoCupon en @/lib/logic) o
  // cuya ficha se recreó con otro id — así esas filas igual muestran el
  // contacto cuando el auto está registrado.
  const { porId, porPatente } = useMemo(() => {
    const porId = new Map<string, Cliente>();
    const porPatente = new Map<string, Cliente>();
    for (const c of clientes) {
      porId.set(c.id, c);
      const placa = normPlate(c.patente);
      if (placa) porPatente.set(placa, c);
    }
    return { porId, porPatente };
  }, [clientes]);

  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Detalle de ingresos</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Patente</th>
              <th>Cliente</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Operador</th>
              <th>Estado plan</th>
            </tr>
          </thead>
          <tbody>
            {ingresosPeriodo.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">Sin ingresos en este período</div>
                </td>
              </tr>
            ) : (
              ingresosPeriodo.map((i) => {
                const tipo = tipoIngreso(i);
                const cliente = porId.get(i.clienteId) || porPatente.get(normPlate(i.patente));
                return (
                  <tr key={i.id}>
                    <td>{fmtDate(i.fecha)}</td>
                    <td className="plate-tag">{i.patente}</td>
                    <td>{i.nombre}</td>
                    <td>{cliente?.email || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{cliente?.telefono ? fmtTelefono(cliente.telefono) : "—"}</td>
                    <td>{i.creadoPor || "—"}</td>
                    <td>
                      <span className={`status-pill ${tipo.cls}`}>{tipo.label}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
