"use client";

import { fmtCLP } from "@/lib/helpers";

export function FilaVentaExpandible({
  rowKey,
  label,
  cantidad,
  monto,
  expandida,
  onToggle,
  desglose,
  columnaDesglose = "Medio de pago",
}: {
  rowKey: string;
  label: string;
  cantidad: number;
  monto: number;
  expandida: boolean;
  onToggle: () => void;
  desglose: { metodo: string; cantidad: number; monto: number }[];
  // Título de la primera columna del detalle: "Medio de pago" en casi todas
  // las filas, pero "Tipo de venta" en "Venta nueva web" (ver
  // desglosePorTipoVenta en useCierreData.ts) porque ahí lo que se agrupa no
  // es el medio de pago (siempre tarjeta) sino qué se vendió.
  columnaDesglose?: string;
}) {
  return (
    <>
      <tr key={rowKey} onClick={onToggle} style={{ cursor: "pointer" }}>
        <td>{expandida ? "▾ " : "▸ "}{label}</td>
        <td>{cantidad}</td>
        <td>{fmtCLP(monto)}</td>
      </tr>
      {expandida && (
        <tr key={`${rowKey}-detalle`}>
          <td colSpan={3} style={{ background: "var(--bg2, rgba(255,255,255,0.03))", padding: "8px 16px" }}>
            {desglose.length === 0 ? (
              <div className="empty" style={{ margin: 0 }}>Sin ventas con medio de pago registrado</div>
            ) : (
              <table style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>{columnaDesglose}</th>
                    <th>Cantidad</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {desglose.map((d) => (
                    <tr key={d.metodo}>
                      <td>{d.metodo}</td>
                      <td>{d.cantidad}</td>
                      <td>{fmtCLP(d.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
