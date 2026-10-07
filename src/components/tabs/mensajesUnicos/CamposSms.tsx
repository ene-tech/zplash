"use client";

import { MAX_SEGMENTOS_SMS, segmentosSms, textoFinalSms } from "@/lib/sms/texto";

// Campos del canal SMS en Mensajes Únicos: a diferencia de WhatsApp no hay
// plantilla aprobada, el texto se escribe acá mismo con las mismas variables
// ({{nombre}}, {{patente}}, {{montoOferta}}, {{fechaVencimientoOferta}}...).
// El contador cuenta el texto ya normalizado y con el link de baja, que es lo
// que cobra el proveedor (ver @/lib/sms/texto).
export const VARIABLES_SMS = ["nombre", "patente", "plan", "fechaVencimiento", "montoOferta", "montoDescuento", "montoAPagar", "fechaVencimientoOferta", "diasValidez", "descuentoReferido"];

export function CamposSms(props: {
  campana: string;
  setCampana: (v: string) => void;
  texto: string;
  setTexto: (v: string) => void;
  // Texto del primer cliente seleccionado con las variables ya reemplazadas.
  preview: string;
}) {
  const final = textoFinalSms(props.preview, "XXXXXX");
  const segmentos = segmentosSms(final);
  const demasiadoLargo = segmentos > MAX_SEGMENTOS_SMS;

  return (
    <>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Nombre de la campaña</label>
        <input
          value={props.campana}
          onChange={(e) => props.setCampana(e.target.value)}
          placeholder="ej. vencidos-octubre-2026"
        />
        <div className="hint" style={{ textAlign: "left", fontSize: 12 }}>
          Sirve para medirla después y para no mandarle dos veces la misma campaña a nadie si reintentas el envío.
        </div>
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Texto del SMS</label>
        <textarea rows={4} value={props.texto} onChange={(e) => props.setTexto(e.target.value)} placeholder="Hola {{nombre}}, ..." />
        <div className="hint" style={{ textAlign: "left", fontSize: 12 }}>
          Variables: {VARIABLES_SMS.map((v) => `{{${v}}}`).join(" ")}. Las tildes (salvo ñ y é) y los emojis se quitan al
          enviar, porque convierten cada SMS en dos o tres. Los saltos de línea tampoco llegan al teléfono: todo sale
          en una línea, como en la vista previa. Al final se agrega solo el link para darse de baja.
        </div>
      </div>
      {props.texto && (
        <div className="field" style={{ marginBottom: 10 }}>
          <label>
            Vista previa (primer cliente seleccionado) · {final.length} caracteres ·{" "}
            <strong style={{ color: demasiadoLargo ? "var(--red)" : undefined }}>
              {segmentos} SMS por cliente
            </strong>
          </label>
          <textarea readOnly rows={5} value={final} />
          {demasiadoLargo && <div className="err">Máximo {MAX_SEGMENTOS_SMS} SMS por cliente: acorta el texto.</div>}
        </div>
      )}
    </>
  );
}
