"use client";

import { fmtFecha } from "@/lib/helpers";
import type { ticketsYCampanas } from "./ticketsYCampanas";

type Props = ReturnType<typeof ticketsYCampanas>;

const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : "0.0") + "%";

// Contador de tickets (vales) y de campañas de descuento del período de
// arriba. Los canjes de una campaña son a la fecha, no solo dentro del período.
export function StatsTicketsCampanas({ tickets, campanas }: Props) {
  const enviados = campanas.reduce((s, c) => s + c.enviados, 0);
  const canjeados = campanas.reduce((s, c) => s + c.canjeados, 0);
  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Tickets</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{tickets.emitidos}</div>
          <div className="lbl">Tickets emitidos en el período</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{tickets.canjeados}</div>
          <div className="lbl">Tickets canjeados en el período</div>
        </div>
        <div className="stat-card warn">
          <div className="num">{tickets.vivos}</div>
          <div className="lbl">Tickets vigentes sin usar hoy</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Campañas</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{campanas.length}</div>
          <div className="lbl">Campañas lanzadas en el período</div>
        </div>
        <div className="stat-card">
          <div className="num">{enviados}</div>
          <div className="lbl">Códigos enviados</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{canjeados}</div>
          <div className="lbl">Códigos canjeados</div>
        </div>
        <div className="stat-card">
          <div className="num">{pct(canjeados, enviados)}</div>
          <div className="lbl">Tasa de canje</div>
        </div>
      </div>
      <table style={{ margin: "12px 0 24px" }}>
        <thead>
          <tr>
            <th>Campaña</th>
            <th>Fecha</th>
            <th>Enviados</th>
            <th>Canjeados</th>
            <th>Canje</th>
          </tr>
        </thead>
        <tbody>
          {campanas.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="empty">Sin campañas en el período seleccionado</div>
              </td>
            </tr>
          ) : (
            campanas.map((c) => (
              <tr key={c.nombre}>
                <td>{c.nombre}</td>
                <td>{fmtFecha(c.fecha)}</td>
                <td>{c.enviados}</td>
                <td>{c.canjeados}</td>
                <td>{pct(c.canjeados, c.enviados)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
