"use client";

export function StatsResumenGlobal({
  clientesTotales,
  ingresosHoy,
  ingresosHistoricos,
  porVencer,
  vencidos,
  vencidosWeb,
  vencidosLocal,
  sinPlan,
  vigentes,
  vigentesWeb,
  vigentesLocal,
  vigentesRenovacionAuto,
}: {
  clientesTotales: number;
  ingresosHoy: number;
  ingresosHistoricos: number;
  porVencer: number;
  vencidos: number;
  vencidosWeb: number;
  vencidosLocal: number;
  sinPlan: number;
  vigentes: number;
  vigentesWeb: number;
  vigentesLocal: number;
  vigentesRenovacionAuto: number | null;
}) {
  return (
    <div className="stat-grid">
      <div className="stat-card">
        <div className="num">{clientesTotales}</div>
        <div className="lbl">Clientes totales</div>
      </div>
      <div className="stat-card">
        <div className="num">{ingresosHoy}</div>
        <div className="lbl">Ingresos hoy</div>
      </div>
      <div className="stat-card">
        <div className="num">{ingresosHistoricos}</div>
        <div className="lbl">Ingresos históricos</div>
      </div>
      <div className="stat-card warn">
        <div className="num">{porVencer}</div>
        <div className="lbl">Planes por vencer</div>
      </div>
      <div className="stat-card bad">
        <div className="num">{vencidos}</div>
        <div className="lbl">Planes vencidos</div>
      </div>
      <div className="stat-card bad">
        <div className="num">{vencidosWeb}</div>
        <div className="lbl">Vencidos · Web</div>
      </div>
      <div className="stat-card bad">
        <div className="num">{vencidosLocal}</div>
        <div className="lbl">Vencidos · Local</div>
      </div>
      <div className="stat-card bad">
        <div className="num">{sinPlan}</div>
        <div className="lbl">Sin plan</div>
      </div>
      <div className="stat-card ok">
        <div className="num">{vigentes}</div>
        <div className="lbl">Planes vigentes</div>
      </div>
      <div className="stat-card ok">
        <div className="num">{vigentesRenovacionAuto ?? "…"}</div>
        <div className="lbl">Con renovación automática</div>
      </div>
      <div className="stat-card">
        <div className="num">{vigentesWeb}</div>
        <div className="lbl">Vigentes · Web</div>
      </div>
      <div className="stat-card">
        <div className="num">{vigentesLocal}</div>
        <div className="lbl">Vigentes · Local</div>
      </div>
    </div>
  );
}
