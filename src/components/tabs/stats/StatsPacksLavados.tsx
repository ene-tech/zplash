"use client";

import { fmtCLP } from "@/lib/helpers";
import type { useStatsData } from "./useStatsData";

type Props = Pick<ReturnType<typeof useStatsData>, "packsLavados" | "upgradesPack">;

// Packs de 2 y 4 tickets vendidos en el período de arriba, y en qué quedaron
// HOY sus tickets: usados, pendientes de uso (vivos) y caducados sin usar.
export function StatsPacksLavados(p: Props) {
  return (
    <>
      {p.packsLavados.map((pack) => (
        <div key={pack.id}>
          <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Pack {pack.lavados} tickets</h3>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="num">{pack.ventas}</div>
              <div className="lbl">Packs vendidos</div>
              <div className="lbl" style={{ marginTop: 4 }}>
                {pack.ventasWeb} web · {pack.ventas - pack.ventasWeb} mesón
              </div>
            </div>
            <div className="stat-card ok">
              <div className="num">{fmtCLP(pack.monto)}</div>
              <div className="lbl">Monto vendido</div>
            </div>
            <div className="stat-card">
              <div className="num">{pack.ticketsEmitidos}</div>
              <div className="lbl">Tickets emitidos</div>
              {pack.lavados === 4 && p.upgradesPack.ventas > 0 && (
                <div className="lbl" style={{ marginTop: 4 }}>
                  Incluye los de {p.upgradesPack.ventas} upgrade{p.upgradesPack.ventas === 1 ? "" : "s"}
                </div>
              )}
            </div>
            <div className="stat-card ok">
              <div className="num">{pack.usados}</div>
              <div className="lbl">Tickets usados</div>
            </div>
            <div className="stat-card warn">
              <div className="num">{pack.pendientes}</div>
              <div className="lbl">Tickets pendientes de uso</div>
            </div>
            <div className="stat-card bad">
              <div className="num">{pack.caducados}</div>
              <div className="lbl">Tickets caducados sin usar</div>
            </div>
          </div>
        </div>
      ))}
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div className="stat-card">
          <div className="num">{p.upgradesPack.ventas}</div>
          <div className="lbl">Upgrades a Promo 4 Lavados</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {fmtCLP(p.upgradesPack.monto)}
          </div>
        </div>
      </div>
    </>
  );
}
