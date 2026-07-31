import { fmtFecha, planStatus } from "@/lib/helpers";
import type { Cliente } from "@/types";

export function ClientesSeleccionablesList({
  candidatos,
  excluidos,
  onToggle,
}: {
  candidatos: Cliente[];
  excluidos: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8, marginBottom: 14 }}>
      {candidatos.length === 0 && (
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)" }}>
          Ningún cliente coincide con el filtro elegido.
        </div>
      )}
      {candidatos.map((c) => {
        const sinTel = !c.telefono;
        return (
          <label
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 400,
              padding: "4px 2px",
              opacity: sinTel ? 0.5 : 1,
            }}
          >
            <input type="checkbox" disabled={sinTel} checked={!sinTel && !excluidos.has(c.id)} onChange={() => onToggle(c.id)} />
            <span style={{ flex: 1 }}>
              {c.nombre} · {c.patente} {c.plan ? `· ${c.plan}` : ""}
              {" · "}
              {c.visitas || 0} pasada{c.visitas === 1 ? "" : "s"}
              {c.ultimaVisita ? ` · última visita ${fmtFecha(c.ultimaVisita)}` : " · nunca ha venido"}
            </span>
            <span className="hint" style={{ margin: 0, fontSize: 12, color: "var(--gray)" }}>
              {sinTel ? "Sin teléfono" : planStatus(c).label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
