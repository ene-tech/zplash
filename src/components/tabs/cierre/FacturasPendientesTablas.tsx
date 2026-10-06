"use client";

import { useState } from "react";
import { fmtCLP } from "@/lib/helpers";
import type { useCierreData } from "./useCierreData";

type Props = Pick<ReturnType<typeof useCierreData>, "facturaPendientesPeriodo" | "facturasEmpresaPeriodo" | "marcarEmitida" | "emitirFactura">;

export function FacturasPendientesTablas({ facturaPendientesPeriodo, facturasEmpresaPeriodo, marcarEmitida, emitirFactura }: Props) {
  // Bloquea los botones mientras SimpleFactura responde: un segundo clic emitiría otra factura.
  const [emitiendo, setEmitiendo] = useState(false);
  const acciones = (ventaIds: string[]) => (
    <div style={{ display: "flex", gap: 6 }}>
      <button
        className="btn"
        disabled={emitiendo}
        onClick={async () => {
          setEmitiendo(true);
          await emitirFactura(ventaIds).finally(() => setEmitiendo(false));
        }}
      >
        {emitiendo ? "Emitiendo…" : "Emitir factura"}
      </button>
      <button className="btn ghost" disabled={emitiendo} onClick={() => marcarEmitida(ventaIds)} title="Ya se emitió por fuera (portal SII o SimpleFactura)">
        Ya emitida
      </button>
    </div>
  );
  return (
    <>
      {facturaPendientesPeriodo.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Clientes esperando documento tributario</h3>
          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Razón Social</th>
                <th>RUT</th>
                <th>Detalle</th>
                <th>Monto total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {facturaPendientesPeriodo.map((grupo) => (
                <tr key={grupo.rut || grupo.razonSocial}>
                  <td>{grupo.razonSocial || "-"}</td>
                  <td>{grupo.rut || "-"}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {grupo.clientes.map(({ cliente: c, monto }) => (
                        <span key={c.id} style={{ fontSize: 13 }}>
                          <span className="plate-tag" style={{ marginRight: 6 }}>{c.patente}</span>
                          {c.nombre && <span style={{ marginRight: 6 }}>{c.nombre}</span>}
                          {fmtCLP(monto)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{fmtCLP(grupo.montoTotal)}</td>
                  <td>
                    {acciones(grupo.ventaIdsTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {facturasEmpresaPeriodo.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Facturas pendientes — Compras web</h3>
          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Detalle</th>
                <th>Patente</th>
                <th>Razón Social</th>
                <th>RUT</th>
                <th>Dirección</th>
                <th>Giro</th>
                <th>Email</th>
                <th>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {facturasEmpresaPeriodo.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.tipo}
                    {v.tipo !== v.nombre && <div style={{ fontSize: 12, color: "var(--gray)" }}>{v.nombre}</div>}
                  </td>
                  <td>{v.patente ? <span className="plate-tag">{v.patente}</span> : "-"}</td>
                  <td>{v.razonSocial || "-"}</td>
                  <td>{v.rut || "-"}</td>
                  <td>{v.direccion || "-"}</td>
                  <td>{v.giro || "-"}</td>
                  <td>{v.email || "-"}</td>
                  <td>{fmtCLP(v.precio)}</td>
                  <td>
                    {acciones([v.id])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
