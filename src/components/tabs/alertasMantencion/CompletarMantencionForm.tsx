"use client";

import type { AlertaMantencion } from "@/types";

export function CompletarMantencionForm({
  completando,
  maquinariaNombre,
  responsableCompletar,
  setResponsableCompletar,
  costoCompletarTexto,
  setCostoCompletarTexto,
  onCancelar,
  onConfirmar,
}: {
  completando: AlertaMantencion;
  maquinariaNombre: (id: string) => string;
  responsableCompletar: string;
  setResponsableCompletar: (v: string) => void;
  costoCompletarTexto: string;
  setCostoCompletarTexto: (v: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginTop: 20 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>
        Registrar mantención realizada: {completando.descripcion} ({maquinariaNombre(completando.maquinariaId)})
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 200, flex: 1 }}>
          <label>Responsable</label>
          <input value={responsableCompletar} onChange={(e) => setResponsableCompletar(e.target.value)} />
        </div>
        <div className="field" style={{ minWidth: 140 }}>
          <label>Costo (opcional)</label>
          <input type="number" min={0} value={costoCompletarTexto} onChange={(e) => setCostoCompletarTexto(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button className="btn ghost" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="btn" onClick={onConfirmar}>
          Confirmar mantención realizada
        </button>
      </div>
    </div>
  );
}
