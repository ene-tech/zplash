"use client";

import { useState } from "react";

// Pausa o reanuda el cobro automático sin eliminar la tarjeta — ver
// /api/cliente/mi-cuenta/pausar-tarjeta.
export function PausarTarjeta({ patente, pausada, onCambio }: { patente: string; pausada: boolean; onCambio: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/mi-cuenta/pausar-tarjeta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente, pausar: !pausada }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el cambio");
        setGuardando(false);
        return;
      }
      setConfirmando(false);
      setGuardando(false);
      onCambio();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: 8, marginRight: 8, padding: "6px 10px", fontSize: 12.5 }}
        onClick={() => setConfirmando(true)}
      >
        {pausada ? "Reanudar renovación" : "Pausar renovación"}
      </button>

      {confirmando && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3>{pausada ? "Reanudar" : "Pausar"} renovación de {patente}</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              {pausada
                ? "Se vuelve a cobrar el plan automáticamente con tu tarjeta guardada. Si tu plan ya venció, el cobro se hace al día siguiente."
                : "No se cobrará el plan automáticamente al vencer. Tu tarjeta queda guardada y puedes reanudar cuando quieras. El plan que ya pagaste sigue vigente hasta su vencimiento."}
            </div>
            {error && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmando(false)} disabled={guardando}>
                Volver
              </button>
              <button type="button" className="btn" onClick={confirmar} disabled={guardando}>
                {guardando ? "Guardando..." : pausada ? "Sí, reanudar" : "Sí, pausar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
