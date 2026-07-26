"use client";

import { useState } from "react";
import { fmtCLP } from "@/lib/helpers";
import type { MovimientoContable, Venta } from "@/types";
import { desglosePagoContables, desglosePagoVentas, type useCierreData } from "./useCierreData";
import { FilaVentaExpandible } from "./FilaVentaExpandible";

type Props = Pick<
  ReturnType<typeof useCierreData>,
  "filasVenta" | "totalCantidadVentas" | "totalMontoVentas" | "modificacionesAdmin" | "otrasVentas" | "metodosPago" | "totalCantidadMetodosPago" | "totalMontoMetodosPago"
>;

// "Detalle de venta del período" (expandible por medio de pago) y "Métodos
// de pago" — el estado de qué fila está expandida es puramente de UI, vive
// acá y no en useCierreData.
export function DetalleVentaYMetodosPago(p: Props) {
  const [filaExpandida, setFilaExpandida] = useState<string | null>(null);

  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Detalle de venta del período</h3>
      <p style={{ fontSize: 12, color: "var(--gray)", marginTop: -6, marginBottom: 10 }}>
        Haz clic en una fila para ver los medios de pago usados en esas ventas.
      </p>
      <table style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {p.filasVenta.map((f) => (
            <FilaVentaExpandible
              key={f.tipo}
              rowKey={f.tipo}
              label={f.label}
              cantidad={f.cantidad}
              monto={f.monto}
              expandida={filaExpandida === f.tipo}
              onToggle={() => setFilaExpandida(filaExpandida === f.tipo ? null : f.tipo)}
              desglose={
                f.tipo === "ingreso-modulo-contabilidad"
                  ? desglosePagoContables(f.items as MovimientoContable[])
                  : desglosePagoVentas(f.items as Venta[])
              }
            />
          ))}
          <tr>
            <td style={{ fontWeight: 700, fontSize: 16 }}>Total</td>
            <td style={{ fontWeight: 700, fontSize: 16 }}>{p.totalCantidadVentas}</td>
            <td style={{ fontWeight: 700, fontSize: 16 }}>{fmtCLP(p.totalMontoVentas)}</td>
          </tr>
          {p.modificacionesAdmin.cantidad > 0 && (
            <FilaVentaExpandible
              rowKey={p.modificacionesAdmin.tipo}
              label={p.modificacionesAdmin.label}
              cantidad={p.modificacionesAdmin.cantidad}
              monto={p.modificacionesAdmin.monto}
              expandida={filaExpandida === p.modificacionesAdmin.tipo}
              onToggle={() => setFilaExpandida(filaExpandida === p.modificacionesAdmin.tipo ? null : p.modificacionesAdmin.tipo)}
              desglose={desglosePagoVentas(p.modificacionesAdmin.items)}
            />
          )}
          {p.otrasVentas.length > 0 && (
            <FilaVentaExpandible
              rowKey="otras-ventas"
              label="Otros"
              cantidad={p.otrasVentas.length}
              monto={p.otrasVentas.reduce((s, v) => s + (v.precio || 0), 0)}
              expandida={filaExpandida === "otras-ventas"}
              onToggle={() => setFilaExpandida(filaExpandida === "otras-ventas" ? null : "otras-ventas")}
              desglose={desglosePagoVentas(p.otrasVentas)}
            />
          )}
        </tbody>
      </table>

      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Métodos de pago</h3>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Método</th>
            <th>Cantidad</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {p.metodosPago.map((m) => (
            <tr key={m.metodo}>
              <td>{m.metodo}</td>
              <td>{m.cantidad}</td>
              <td>{fmtCLP(m.monto)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ fontWeight: 700, fontSize: 16 }}>Total</td>
            <td style={{ fontWeight: 700, fontSize: 16 }}>{p.totalCantidadMetodosPago}</td>
            <td style={{ fontWeight: 700, fontSize: 16 }}>{fmtCLP(p.totalMontoMetodosPago)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
