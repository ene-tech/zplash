"use client";

import { useApp } from "@/context/AppContext";
import { planStatus, todayStr } from "@/lib/helpers";

export default function StatsTab() {
  const { data } = useApp();
  const hoy = todayStr();
  const ingresosHoy = data.ingresos.filter((i) => new Date(i.fecha).toDateString() === hoy).length;
  const vencidos = data.clientes.filter((c) => planStatus(c).cls === "bad").length;
  const porVencer = data.clientes.filter((c) => planStatus(c).cls === "warn").length;
  const vigentes = data.clientes.filter((c) => planStatus(c).cls !== "bad");
  const vigentesWeb = vigentes.filter((c) => c.origen === "WEB").length;
  const vigentesLocal = vigentes.length - vigentesWeb;

  return (
    <div className="stat-grid">
      <div className="stat-card">
        <div className="num">{data.clientes.length}</div>
        <div className="lbl">Clientes totales</div>
      </div>
      <div className="stat-card">
        <div className="num">{ingresosHoy}</div>
        <div className="lbl">Ingresos hoy</div>
      </div>
      <div className="stat-card">
        <div className="num">{data.ingresos.length}</div>
        <div className="lbl">Ingresos históricos</div>
      </div>
      <div className="stat-card">
        <div className="num">{porVencer}</div>
        <div className="lbl">Planes por vencer</div>
      </div>
      <div className="stat-card">
        <div className="num">{vencidos}</div>
        <div className="lbl">Planes vencidos</div>
      </div>
      <div className="stat-card">
        <div className="num">{vigentes.length}</div>
        <div className="lbl">Planes vigentes</div>
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
