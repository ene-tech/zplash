"use client";

import { fmtCLP, inRange, planStatus } from "@/lib/helpers";
import type { Cliente, Ingreso, Venta } from "@/types";

export function ClientesFacturaTabla({
  facturaFiltrados,
  ingresos,
  ventas,
  desde,
  hasta,
  facturaSearch,
  onSearchChange,
  onDescargar,
}: {
  facturaFiltrados: Cliente[];
  ingresos: Ingreso[];
  ventas: Venta[];
  desde: string;
  hasta: string;
  facturaSearch: string;
  onSearchChange: (v: string) => void;
  onDescargar: () => void;
}) {
  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Clientes con Factura (documentos tributarios)</h3>
      <div className="toolbar">
        <input
          placeholder="Buscar por nombre, razón social, RUT o patente..."
          value={facturaSearch}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button className="btn ghost" onClick={onDescargar}>
          Descargar facturables (Excel)
        </button>
      </div>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Razón Social</th>
            <th>RUT</th>
            <th>Giro</th>
            <th>Dirección</th>
            <th>Email</th>
            <th>Ingresos período</th>
            <th>Planes período</th>
            <th>Estado plan</th>
          </tr>
        </thead>
        <tbody>
          {facturaFiltrados.length === 0 ? (
            <tr>
              <td colSpan={10}>
                <div className="empty">No hay clientes con Factura{facturaSearch ? " que coincidan con la búsqueda" : ""}</div>
              </td>
            </tr>
          ) : (
            facturaFiltrados.map((c) => {
              const ingPeriodo = ingresos.filter((i) => i.clienteId === c.id && inRange(i.fecha, desde, hasta)).length;
              const ventPeriodo = ventas.filter((v) => v.clienteId === c.id && inRange(v.fecha, desde, hasta));
              const montoVentas = ventPeriodo.reduce((s, v) => s + (v.precio || 0), 0);
              const st = planStatus(c);
              return (
                <tr key={c.id}>
                  <td className="plate-tag">{c.patente}</td>
                  <td>{c.nombre}</td>
                  <td>{c.razonSocial || "-"}</td>
                  <td>{c.rut || "-"}</td>
                  <td>{c.giro || "-"}</td>
                  <td>{c.direccion || "-"}</td>
                  <td>{c.email || "-"}</td>
                  <td>{ingPeriodo}</td>
                  <td>
                    {ventPeriodo.length}
                    {ventPeriodo.length ? " · " + fmtCLP(montoVentas) : ""}
                  </td>
                  <td>
                    <span className={`status-pill ${st.cls}`}>{st.label}</span>
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
