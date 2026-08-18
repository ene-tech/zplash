export const FILTROS_ESTADO_CORREO = ["todos", "Vigente", "Por vencer", "Vencido", "Sin plan"] as const;
export type FiltroEstadoCorreo = (typeof FILTROS_ESTADO_CORREO)[number];

export const FILTROS_ORIGEN_CORREO = ["todos", "WEB", "LOCAL"] as const;
export type FiltroOrigenCorreo = (typeof FILTROS_ORIGEN_CORREO)[number];

// Segmentación por cobro automático (Oneclick), sin mirar el origen del
// cliente: la tarjeta se inscribe por patente (Mi Cuenta → "Mis tarjetas"),
// así que un cliente LOCAL también puede tener cobro automático activo —
// mismo criterio que condicionSoloSinAutopago en @/db/schema/mailReglas.
export const FILTROS_AUTOPAGO = ["todos", "activo", "sin", "cobro_rechazado"] as const;
export type FiltroAutopago = (typeof FILTROS_AUTOPAGO)[number];

const AUTOPAGO_LABEL: Record<FiltroAutopago, string> = {
  todos: "Todos",
  activo: "Con cobro automático activo",
  sin: "Sin cobro automático",
  cobro_rechazado: "Último cobro automático rechazado",
};

// Filtros de selección de destinatarios del envío puntual por correo (Web
// Settings → Correos Únicos). 100% controlado por props, sin estado propio —
// mismo patrón que FiltrosEnvioMasivo en la carpeta mensajesUnicos.
export function FiltrosEnvioCorreo({
  filtroEstado,
  setFiltroEstado,
  filtroOrigen,
  setFiltroOrigen,
  vencidoDiasMax,
  setVencidoDiasMax,
  filtroAutopago,
  setFiltroAutopago,
  busqueda,
  setBusqueda,
}: {
  filtroEstado: FiltroEstadoCorreo;
  setFiltroEstado: (v: FiltroEstadoCorreo) => void;
  filtroOrigen: FiltroOrigenCorreo;
  setFiltroOrigen: (v: FiltroOrigenCorreo) => void;
  vencidoDiasMax: string;
  setVencidoDiasMax: (v: string) => void;
  filtroAutopago: FiltroAutopago;
  setFiltroAutopago: (v: FiltroAutopago) => void;
  busqueda: string;
  setBusqueda: (v: string) => void;
}) {
  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div className="field" style={{ flex: 1, minWidth: 170, margin: 0 }}>
          <label>Estado del plan</label>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstadoCorreo)}>
            {FILTROS_ESTADO_CORREO.map((f) => (
              <option key={f} value={f}>
                {f === "todos" ? "Todos" : f}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 130, margin: 0 }}>
          <label>Origen</label>
          <select value={filtroOrigen} onChange={(e) => setFiltroOrigen(e.target.value as FiltroOrigenCorreo)}>
            {FILTROS_ORIGEN_CORREO.map((o) => (
              <option key={o} value={o}>
                {o === "todos" ? "Todos" : o === "WEB" ? "Web" : "Local"}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 170, margin: 0 }}>
          <label>Vencido hace máximo (días)</label>
          <input
            type="number"
            min={0}
            value={vencidoDiasMax}
            onChange={(e) => setVencidoDiasMax(e.target.value)}
            placeholder="Ej: 7"
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div className="field" style={{ flex: 1, minWidth: 240, margin: 0 }}>
          <label>Cobro automático</label>
          <select value={filtroAutopago} onChange={(e) => setFiltroAutopago(e.target.value as FiltroAutopago)}>
            {FILTROS_AUTOPAGO.map((a) => (
              <option key={a} value={a}>
                {AUTOPAGO_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180, margin: 0 }}>
          <label>Buscar por nombre o patente</label>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej: Juan o AB1234" />
        </div>
      </div>

      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5, margin: "0 0 12px" }}>
        &quot;Vencido hace máximo&quot; deja solo a quienes ya tienen el plan vencido, acotando qué tan atrás (7 = los
        que se vencieron esta semana, sin arrastrar a los de hace meses). Si el correo habla de un cobro que falló,
        elegí <strong>Último cobro automático rechazado</strong>: es el único grupo al que de verdad se le intentó
        cobrar y no se pudo — a un cliente sin tarjeta inscrita ese texto le llega como un cobro que nunca existió.
      </div>
    </>
  );
}
