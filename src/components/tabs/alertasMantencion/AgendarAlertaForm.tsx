"use client";

import { sumarMeses, todayYMD } from "@/lib/helpers";
import type { useAlertasMantencion } from "./useAlertasMantencion";

const ATAJOS_MESES = [1, 3, 6, 12];

type Props = Pick<
  ReturnType<typeof useAlertasMantencion>,
  "maquinariasActivas" | "maquinariaId" | "setMaquinariaId" | "descripcion" | "setDescripcion" | "fechaObjetivo" | "setFechaObjetivo" | "notas" | "setNotas" | "err" | "limpiar" | "agendar"
>;

export function AgendarAlertaForm(p: Props) {
  if (p.maquinariasActivas.length === 0) {
    return <div className="empty">Agrega una máquina activa en la pestaña Máquinas antes de agendar una alerta</div>;
  }
  return (
    <>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>Máquina</label>
          <select value={p.maquinariaId} onChange={(e) => p.setMaquinariaId(e.target.value)}>
            {p.maquinariasActivas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>Descripción</label>
          <input
            value={p.descripcion}
            onChange={(e) => p.setDescripcion(e.target.value)}
            placeholder="Ej: Aseo general aire acondicionado"
          />
        </div>
      </div>

      <div className="field">
        <label>Fecha objetivo</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={p.fechaObjetivo} onChange={(e) => p.setFechaObjetivo(e.target.value)} />
          {ATAJOS_MESES.map((meses) => (
            <button
              key={meses}
              type="button"
              className="btn ghost"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => p.setFechaObjetivo(sumarMeses(todayYMD(), meses))}
            >
              +{meses} {meses === 1 ? "mes" : "meses"}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Notas (opcional)</label>
        <input value={p.notas} onChange={(e) => p.setNotas(e.target.value)} placeholder="Detalles adicionales" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn ghost" onClick={p.limpiar}>
          Limpiar
        </button>
        <button className="btn" onClick={p.agendar}>
          Agendar alerta
        </button>
      </div>
      <div className="err" style={{ color: p.err?.ok ? "var(--green)" : undefined }}>
        {p.err?.msg || ""}
      </div>
    </>
  );
}
