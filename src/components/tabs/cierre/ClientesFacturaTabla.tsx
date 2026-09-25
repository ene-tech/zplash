"use client";

import { fmtCLP, planStatus } from "@/lib/helpers";
import type { Cliente } from "@/types";

export function ClientesFacturaTabla({
  facturaFiltrados,
  montosAFacturar,
  facturaSearch,
  onSearchChange,
  onDescargar,
}: {
  facturaFiltrados: Cliente[];
  montosAFacturar: Map<string, number>;
  facturaSearch: string;
  onSearchChange: (v: string) => void;
  onDescargar: () => void;
}) {
  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 4px" }}>Clientes con Factura (documentos tributarios)</h3>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
        Solo los que tienen algo que facturar en el período seleccionado.
      </div>
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
                <div className="empty">
                  {facturaSearch
                    ? "Ningún cliente con Factura del período coincide con la búsqueda"
                    : "No hay nada que facturar en el período seleccionado"}
                </div>
              </td>
            </tr>
          ) : (
            facturaFiltrados.map((c) => {
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
                  <td>{fmtCLP(montosAFacturar.get(c.id) || 0)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </>
  );
}
