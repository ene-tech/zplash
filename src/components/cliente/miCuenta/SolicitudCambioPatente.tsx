"use client";

import { useState } from "react";
import { fmtFecha, isValidPatente, normPlate, PATENTE_FORMATO_MSG } from "@/lib/helpers";

// Solo aplica a vehículos con un plan mensual vigente: el cambio de patente
// no es inmediato porque el plan ya está pagado/activo para el mes en curso
// bajo la patente actual — se hace efectivo recién cuando ese mes termina y
// empieza el siguiente. Por ahora esto solo queda visible en la pantalla
// (no hay backend detrás del login todavía, ver MiCuentaTab).
export function SolicitudCambioPatente({ patente, plan, vencimiento }: { patente: string; plan: string; vencimiento: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [solicitada, setSolicitada] = useState<string | null>(null);

  if (solicitada) {
    return (
      <p style={{ color: "var(--gray)", fontSize: 12.5, marginTop: 8 }}>
        Solicitaste cambiar tu patente a <strong>{solicitada}</strong>. El cambio se aplicará
        automáticamente a tu plan cuando termine tu mes actual{vencimiento ? ` (vence el ${fmtFecha(vencimiento)})` : ""} e
        inicie el próximo — hasta esa fecha tu plan sigue funcionando con la patente {patente}.
      </p>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: 8, padding: "6px 10px", fontSize: 12.5 }}
        onClick={() => setAbierto(true)}
      >
        Solicitar cambio de patente
      </button>
    );
  }

  const pedirConfirmacion = () => {
    if (!isValidPatente(nueva)) {
      setError(PATENTE_FORMATO_MSG);
      return;
    }
    if (normPlate(nueva) === normPlate(patente)) {
      setError("Esa ya es tu patente actual.");
      return;
    }
    setConfirmando(true);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="field" style={{ marginBottom: 6 }}>
        <input
          value={nueva}
          onChange={(e) => {
            setNueva(e.target.value.toUpperCase());
            setError("");
          }}
          placeholder="Nueva patente (ej. AB1234)"
          maxLength={6}
          style={{ textTransform: "uppercase" }}
        />
      </div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn" style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }} onClick={pedirConfirmacion}>
          Confirmar
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }}
          onClick={() => {
            setAbierto(false);
            setNueva("");
            setError("");
          }}
        >
          Cancelar
        </button>
      </div>

      {confirmando && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3>Confirmar cambio de patente</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              ¿Estás seguro que deseas cambiar tu <strong>{plan}</strong> de tu vehículo patente{" "}
              <strong>{patente}</strong> a tu patente <strong>{normPlate(nueva)}</strong>?
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSolicitada(normPlate(nueva));
                  setConfirmando(false);
                  setAbierto(false);
                }}
              >
                Sí, cambiar patente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
