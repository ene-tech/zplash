"use client";

import { LETRA_DIA, ORDEN_DIAS_SEMANA, fmtDiasSemana } from "@/lib/helpers";

/** "Válido desde" y los días de la semana en que se puede usar un ticket o un
 * descuento: los comparten Crear descuento y Generar cupones. Sin fecha =
 * desde que se emite; todos los días marcados (o ninguno) = sin restricción.
 * El mesón le dice al cliente el motivo si llega otro día (ver
 * restriccionDeUso en @/lib/helpers/cupones). */
export default function VigenciaDiasFields({
  validoDesde,
  setValidoDesde,
  diasSemana,
  setDiasSemana,
}: {
  validoDesde: string;
  setValidoDesde: (v: string) => void;
  diasSemana: number[];
  setDiasSemana: (v: number[]) => void;
}) {
  const todos = diasSemana.length === 0 || diasSemana.length === 7;
  const alternar = (d: number) => {
    const base = diasSemana.length ? diasSemana : ORDEN_DIAS_SEMANA;
    const nuevos = base.includes(d) ? base.filter((x) => x !== d) : [...base, d];
    // Vacío se lee "todos los días": desmarcar el último haría lo contrario.
    if (nuevos.length) setDiasSemana(nuevos);
  };
  return (
    <>
      <div className="field">
        <label>Válido desde (opcional)</label>
        <input type="date" value={validoDesde} onChange={(e) => setValidoDesde(e.target.value)} />
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12 }}>
          Vacío = se puede usar desde hoy.
        </div>
      </div>
      <div className="field">
        <label>Días en que se puede usar</label>
        <div style={{ display: "flex", gap: 6 }}>
          {ORDEN_DIAS_SEMANA.map((d) => (
            <button
              key={d}
              type="button"
              className={todos || diasSemana.includes(d) ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0, padding: "8px 0", minWidth: 0 }}
              onClick={() => alternar(d)}
            >
              {LETRA_DIA[d]}
            </button>
          ))}
        </div>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12 }}>
          {todos ? "Todos los días." : `Solo ${fmtDiasSemana(diasSemana)}.`}
        </div>
      </div>
    </>
  );
}
