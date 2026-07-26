"use client";

import { fmtCLP, primerDiaMesActualYMD, todayYMD } from "@/lib/helpers";
import type { useStatsData } from "./useStatsData";

type Props = Pick<
  ReturnType<typeof useStatsData>,
  | "patchUi"
  | "desde"
  | "hasta"
  | "promedioLavadosDiariosPeriodo"
  | "montoTotalPeriodo"
  | "conPlan"
  | "por9990"
  | "ticketGratis"
  | "ticketPagado"
  | "limpiezasCompletas"
  | "pctPlanes"
  | "pct9990"
  | "pctTickets"
  | "pctLimpiezas"
  | "montoPlanes"
  | "montoPor9990"
  | "montoTickets"
  | "montoLimpiezas"
  | "pctMontoPlanes"
  | "pctMonto9990"
  | "pctMontoTickets"
  | "pctMontoLimpiezas"
>;

// Selector de período + el resumen de ingresos de ese período, mostrado dos
// veces: por cantidad (con su % sobre el total de ingresos) y por monto
// vendido (con su % sobre el monto total).
export function StatsResumenPeriodo(p: Props) {
  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Resumen por período</h3>
      <div className="toolbar">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Desde</label>
          <input type="date" value={p.desde} style={{ maxWidth: 170 }} onChange={(e) => p.patchUi({ statsDesde: e.target.value })} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Hasta</label>
          <input type="date" value={p.hasta} style={{ maxWidth: 170 }} onChange={(e) => p.patchUi({ statsHasta: e.target.value })} />
        </div>
        <button
          className="btn ghost"
          style={{ alignSelf: "flex-end" }}
          onClick={() => p.patchUi({ statsDesde: primerDiaMesActualYMD(), statsHasta: todayYMD() })}
        >
          Mes actual
        </button>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{p.promedioLavadosDiariosPeriodo.toFixed(1)}</div>
          <div className="lbl">Lavados promedios día del Período</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{fmtCLP(p.montoTotalPeriodo)}</div>
          <div className="lbl">Monto total de venta del período</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{fmtCLP(p.montoTotalPeriodo / 1.19)}</div>
          <div className="lbl">Monto total neto del período</div>
        </div>
        <div className="stat-card">
          <div className="num">{p.conPlan.length}</div>
          <div className="lbl">Autos con plan</div>
        </div>
        <div className="stat-card">
          <div className="num">{p.por9990.length}</div>
          <div className="lbl">Autos por {fmtCLP(9990)}</div>
        </div>
        <div className="stat-card">
          <div className="num">{p.ticketGratis.length}</div>
          <div className="lbl">Ticket gratis</div>
        </div>
        <div className="stat-card">
          <div className="num">{p.ticketPagado.length}</div>
          <div className="lbl">Ticket pagado</div>
        </div>
        <div className="stat-card">
          <div className="num">{p.limpiezasCompletas.length}</div>
          <div className="lbl">Limpiezas completas</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Distribución de ingresos por tipo</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">
            {p.conPlan.length} · {p.pctPlanes}
          </div>
          <div className="lbl">Planes</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {fmtCLP(p.montoPlanes)}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">
            {p.por9990.length} · {p.pct9990}
          </div>
          <div className="lbl">{fmtCLP(9990)}</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {fmtCLP(p.montoPor9990)}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">
            {p.ticketGratis.length + p.ticketPagado.length} · {p.pctTickets}
          </div>
          <div className="lbl">Tickets</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {fmtCLP(p.montoTickets)}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">
            {p.limpiezasCompletas.length} · {p.pctLimpiezas}
          </div>
          <div className="lbl">Limpiezas completas</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {fmtCLP(p.montoLimpiezas)}
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Distribución de ingresos por tipo (monto)</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{fmtCLP(p.montoPlanes)}</div>
          <div className="lbl">Planes</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {p.pctMontoPlanes}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">{fmtCLP(p.montoPor9990)}</div>
          <div className="lbl">{fmtCLP(9990)}</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {p.pctMonto9990}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">{fmtCLP(p.montoTickets)}</div>
          <div className="lbl">Tickets</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {p.pctMontoTickets}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">{fmtCLP(p.montoLimpiezas)}</div>
          <div className="lbl">Limpiezas completas</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {p.pctMontoLimpiezas}
          </div>
        </div>
      </div>
    </>
  );
}
