"use client";

import { fmtCLP } from "@/lib/helpers";
import type { useStatsData } from "./useStatsData";

type Props = Pick<ReturnType<typeof useStatsData>, "ventasQrCantidad" | "montoQr" | "pctMontoQrDePlanes" | "rankingQr">;

// Planes que el cliente pagó con tarjeta escaneando el QR del mesón, y qué
// operador se lo mostró (ver ventas.operadorQr). Mismo período de arriba.
// Una sola serie (monto por operador): la barra es la del mismo color de la
// marca, sin leyenda, y la tabla misma es la vista accesible de los números.
export function StatsVentasQr(p: Props) {
  const max = p.rankingQr[0]?.monto || 0;
  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Ventas con QR del mesón</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{p.ventasQrCantidad}</div>
          <div className="lbl">Planes pagados con QR</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{fmtCLP(p.montoQr)}</div>
          <div className="lbl">Monto vendido con QR</div>
        </div>
        <div className="stat-card">
          <div className="num">{p.pctMontoQrDePlanes}</div>
          <div className="lbl">Del monto de planes del período</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Ranking de operadores por ventas con QR</h3>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>Operador</th>
            <th>Planes</th>
            <th style={{ width: "45%" }}>Monto</th>
          </tr>
        </thead>
        <tbody>
          {p.rankingQr.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <div className="empty">Sin ventas con QR en el período seleccionado</div>
              </td>
            </tr>
          ) : (
            p.rankingQr.map((f, i) => (
              <tr key={f.operador} title={`${f.operador}: ${f.ventas} planes · ${fmtCLP(f.monto)}`}>
                <td>{i + 1}</td>
                <td>{f.operador}</td>
                <td>{f.ventas}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div aria-hidden style={{ flex: "0 0 55%" }}>
                      <div
                        style={{
                          height: 10,
                          width: `${max ? Math.max(2, (f.monto / max) * 100) : 0}%`,
                          background: "var(--gold)",
                          borderRadius: "0 4px 4px 0",
                        }}
                      />
                    </div>
                    <span>{fmtCLP(f.monto)}</span>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
