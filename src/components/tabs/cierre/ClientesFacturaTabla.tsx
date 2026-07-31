"use client";

import { fmtCLP, inRange, planStatus } from "@/lib/helpers";
import { montoAFacturar } from "@/lib/logic";
import type { Cliente, Precios, Venta } from "@/types";

export function ClientesFacturaTabla({
  facturaFiltrados,
  ventas,
  precios,
  desde,
  hasta,
  facturaSearch,
  onSearchChange,
  onDescargar,
}: {
  facturaFiltrados: Cliente[];
  ventas: Venta[];
  precios: Precios;
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
            <th>Estado plan</th>
            <th>Monto a facturar</th>
          </tr>
        </thead>
        <tbody>
          {facturaFiltrados.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <div className="empty">No hay clientes con Factura{facturaSearch ? " que coincidan con la búsqueda" : ""}</div>
              </td>
            </tr>
          ) : (
            facturaFiltrados.map((c) => {
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
                  <td>
                    <span className={`status-pill ${st.cls}`}>{st.label}</span>
                  </td>
                  <td>{fmtCLP(montoAFacturar(c, montoVentas, precios))}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </>
  );
}
