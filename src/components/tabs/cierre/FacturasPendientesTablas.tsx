"use client";

import { fmtCLP } from "@/lib/helpers";
import type { useCierreData } from "./useCierreData";

type Props = Pick<ReturnType<typeof useCierreData>, "facturaPendientesPeriodo" | "facturasEmpresaPeriodo">;

// "Clientes esperando documento tributario" (facturas por emitir a
// clientes existentes) y "Facturas pendientes — Venta Empresa" (lotes de
// cupón vendidos con Factura): dos listas de pendientes de facturación,
// ninguna se muestra si no hay filas.
export function FacturasPendientesTablas({ facturaPendientesPeriodo, facturasEmpresaPeriodo }: Props) {
  return (
    <>
      {facturaPendientesPeriodo.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Clientes esperando documento tributario</h3>
          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Patente</th>
                <th>Cliente</th>
                <th>Razón Social</th>
                <th>RUT</th>
                <th>Monto período</th>
              </tr>
            </thead>
            <tbody>
              {facturaPendientesPeriodo.map(({ cliente: c, monto }) => (
                <tr key={c.id}>
                  <td className="plate-tag">{c.patente}</td>
                  <td>{c.nombre}</td>
                  <td>{c.razonSocial || "-"}</td>
                  <td>{c.rut || "-"}</td>
                  <td>{fmtCLP(monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {facturasEmpresaPeriodo.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Facturas pendientes — Venta Empresa</h3>
          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Razón Social</th>
                <th>RUT</th>
                <th>Dirección</th>
                <th>Giro</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {facturasEmpresaPeriodo.map((v) => (
                <tr key={v.id}>
                  <td>{v.nombre}</td>
                  <td>{v.razonSocial || "-"}</td>
                  <td>{v.rut || "-"}</td>
                  <td>{v.direccion || "-"}</td>
                  <td>{v.giro || "-"}</td>
                  <td>{fmtCLP(v.precio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
