export const FILTROS_ESTADO = ["todos", "Vigente", "Por vencer", "Vencido", "Sin plan"] as const;
export type FiltroEstado = (typeof FILTROS_ESTADO)[number];

export const FILTROS_ORIGEN = ["todos", "WEB", "LOCAL"] as const;
export type FiltroOrigen = (typeof FILTROS_ORIGEN)[number];

// Filtros de selección de clientes para el envío masivo (Web Settings →
// Mensajes Únicos): estado del plan/origen/búsqueda, más los filtros de
// comportamiento de compra. Extraído de WebSettingsMensajesUnicosTab para no
// inflar ese archivo (100% controlado por props, sin estado propio) — mismo
// patrón que AccionEnvioMasivoFields/ClientesSeleccionablesList en esta
// carpeta.
export function FiltrosEnvioMasivo({
  filtroEstado,
  setFiltroEstado,
  filtroOrigen,
  setFiltroOrigen,
  busqueda,
  setBusqueda,
  visitasMin,
  setVisitasMin,
  visitasMax,
  setVisitasMax,
  inactivoDiasMin,
  setInactivoDiasMin,
  clienteDesdeDiasMin,
  setClienteDesdeDiasMin,
}: {
  filtroEstado: FiltroEstado;
  setFiltroEstado: (v: FiltroEstado) => void;
  filtroOrigen: FiltroOrigen;
  setFiltroOrigen: (v: FiltroOrigen) => void;
  busqueda: string;
  setBusqueda: (v: string) => void;
  visitasMin: string;
  setVisitasMin: (v: string) => void;
  visitasMax: string;
  setVisitasMax: (v: string) => void;
  inactivoDiasMin: string;
  setInactivoDiasMin: (v: string) => void;
  clienteDesdeDiasMin: string;
  setClienteDesdeDiasMin: (v: string) => void;
}) {
  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div className="field" style={{ flex: 1, minWidth: 180, margin: 0 }}>
          <label>Estado del plan</label>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}>
            {FILTROS_ESTADO.map((f) => (
              <option key={f} value={f}>
                {f === "todos" ? "Todos" : f}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140, margin: 0 }}>
          <label>Origen</label>
          <select value={filtroOrigen} onChange={(e) => setFiltroOrigen(e.target.value as FiltroOrigen)}>
            {FILTROS_ORIGEN.map((o) => (
              <option key={o} value={o}>
                {o === "todos" ? "Todos" : o === "WEB" ? "Web" : "Local"}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180, margin: 0 }}>
          <label>Buscar por nombre o patente</label>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej: Juan o AB1234" />
        </div>
      </div>

      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5, margin: "0 0 6px" }}>
        Filtros por conducta de compra (para segmentar por comportamiento, no solo por estado del plan):
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="field" style={{ flex: 1, minWidth: 130, margin: 0 }}>
          <label>Pasadas totales, mín.</label>
          <input type="number" min={0} value={visitasMin} onChange={(e) => setVisitasMin(e.target.value)} placeholder="Ej: 5" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 130, margin: 0 }}>
          <label>Pasadas totales, máx.</label>
          <input type="number" min={0} value={visitasMax} onChange={(e) => setVisitasMax(e.target.value)} placeholder="Ej: 2" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 170, margin: 0 }}>
          <label>Sin venir hace al menos (días)</label>
          <input
            type="number"
            min={0}
            value={inactivoDiasMin}
            onChange={(e) => setInactivoDiasMin(e.target.value)}
            placeholder="Ej: 30"
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 170, margin: 0 }}>
          <label>Cliente hace al menos (días)</label>
          <input
            type="number"
            min={0}
            value={clienteDesdeDiasMin}
            onChange={(e) => setClienteDesdeDiasMin(e.target.value)}
            placeholder="Ej: 90"
          />
        </div>
      </div>
    </>
  );
}
