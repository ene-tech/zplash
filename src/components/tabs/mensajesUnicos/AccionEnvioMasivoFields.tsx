import type { AccionReglaWhatsapp } from "@/types";

// Bloque "Acción" del envío masivo (Web Settings → Mensajes Únicos): mismo
// contrato que el selector de Acción en ReglasWhatsappTab — "cupon_descuento"
// genera un Cupon real por cliente (ver enviarMensajesMasivosWhatsapp en
// @/lib/whatsapp/masivo), "mensaje_simple" solo llena montoOferta/diasValidez
// como texto libre si la plantilla los usa. Extraído de
// WebSettingsMensajesUnicosTab para no inflar ese archivo (100% controlado
// por props, sin estado propio).
export function AccionEnvioMasivoFields({
  accion,
  setAccion,
  cuponEsPorcentaje,
  setCuponEsPorcentaje,
  cuponValor,
  setCuponValor,
  cuponValidezDias,
  setCuponValidezDias,
  precioBase,
  setPrecioBase,
  usaMontoOferta,
  usaDiasValidez,
  montoOferta,
  setMontoOferta,
  diasValidez,
  setDiasValidez,
}: {
  accion: AccionReglaWhatsapp;
  setAccion: (v: AccionReglaWhatsapp) => void;
  cuponEsPorcentaje: boolean;
  setCuponEsPorcentaje: (v: boolean) => void;
  cuponValor: string;
  setCuponValor: (v: string) => void;
  cuponValidezDias: string;
  setCuponValidezDias: (v: string) => void;
  precioBase: string;
  setPrecioBase: (v: string) => void;
  usaMontoOferta: boolean;
  usaDiasValidez: boolean;
  montoOferta: string;
  setMontoOferta: (v: string) => void;
  diasValidez: string;
  setDiasValidez: (v: string) => void;
}) {
  return (
    <>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Acción</label>
        <select value={accion} onChange={(e) => setAccion(e.target.value as AccionReglaWhatsapp)}>
          <option value="mensaje_simple">Solo enviar el mensaje</option>
          <option value="cupon_descuento">Generar descuento (reconocido por patente al volver)</option>
        </select>
      </div>

      {accion === "cupon_descuento" && (
        <>
          <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5, margin: "0 0 6px" }}>
            Se crea un cupón real por cada cliente seleccionado con teléfono, atado a su patente — el operador lo
            reconoce automáticamente al volver, igual que con las Reglas WhatsApp.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Tipo</label>
              <select value={cuponEsPorcentaje ? "pct" : "monto"} onChange={(e) => setCuponEsPorcentaje(e.target.value === "pct")}>
                <option value="monto">Monto fijo ($)</option>
                <option value="pct">Porcentaje (%)</option>
              </select>
            </div>
            <div className="field" style={{ width: 140, margin: 0 }}>
              <label>Valor</label>
              <input
                type="number"
                min={0}
                value={cuponValor}
                onChange={(e) => setCuponValor(e.target.value)}
                placeholder={cuponEsPorcentaje ? "Ej: 20" : "Ej: 2000"}
              />
            </div>
            <div className="field" style={{ width: 140, margin: 0 }}>
              <label>Válido por (días)</label>
              <input type="number" min={1} value={cuponValidezDias} onChange={(e) => setCuponValidezDias(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ maxWidth: 260, marginBottom: 10 }}>
            <label>Precio base (opcional, para {"{{montoDescuento}}"} / {"{{montoAPagar}}"})</label>
            <input type="number" min={0} value={precioBase} onChange={(e) => setPrecioBase(e.target.value)} placeholder="Ej: 9990" />
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 11.5, marginTop: 4 }}>
              Sin esto, la plantilla solo puede mostrar {"{{montoOferta}}"} (el valor del cupón tal cual, sin calcular
              cuánto queda por pagar).
            </div>
          </div>
        </>
      )}

      {accion === "mensaje_simple" && (usaMontoOferta || usaDiasValidez) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          {usaMontoOferta && (
            <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
              <label>Monto de la oferta ({"{{montoOferta}}"})</label>
              <input type="number" min={0} value={montoOferta} onChange={(e) => setMontoOferta(e.target.value)} placeholder="Ej: 4990" />
            </div>
          )}
          {usaDiasValidez && (
            <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
              <label>Días de validez ({"{{diasValidez}}"})</label>
              <input type="number" min={1} value={diasValidez} onChange={(e) => setDiasValidez(e.target.value)} placeholder="Ej: 7" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
