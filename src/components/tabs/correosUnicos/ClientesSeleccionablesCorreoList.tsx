import { diasVencido, fmtFecha, planStatus } from "@/lib/helpers";
import type { Cliente } from "@/types";

// Gemela de ClientesSeleccionablesList (mensajesUnicos) pero mirando el email
// en vez del teléfono, y mostrando los días de vencido en vez de las pasadas:
// es el dato con el que el admin decide a quién sacar de un envío de plantilla
// transaccional.
export function ClientesSeleccionablesCorreoList({
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
        const sinMail = !c.email;
        const dias = diasVencido(c);
        return (
          <label
            key={c.id}
            style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, padding: "4px 2px", opacity: sinMail ? 0.5 : 1 }}
          >
            <input type="checkbox" disabled={sinMail} checked={!sinMail && !excluidos.has(c.id)} onChange={() => onToggle(c.id)} />
            <span style={{ flex: 1 }}>
              {c.nombre} · {c.patente} {c.plan ? `· ${c.plan}` : ""}
              {c.email ? ` · ${c.email}` : ""}
              {dias !== null ? ` · vencido hace ${dias} día${dias === 1 ? "" : "s"}` : ""}
              {c.vencimiento ? ` (${fmtFecha(c.vencimiento)})` : ""}
            </span>
            <span className="hint" style={{ margin: 0, fontSize: 12, color: "var(--gray)" }}>
              {sinMail ? "Sin email" : planStatus(c).label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
