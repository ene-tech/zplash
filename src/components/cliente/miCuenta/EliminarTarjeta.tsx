"use client";

import { useState } from "react";

// A diferencia de QuitarVehiculo (que solo desvincula la patente de la
// cuenta), esto cancela de verdad la tarjeta en Transbank — ver
// /api/cliente/mi-cuenta/eliminar-tarjeta.
export function EliminarTarjeta({ patente, onEliminada }: { patente: string; onEliminada: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");

  async function eliminar() {
    setEliminando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/mi-cuenta/eliminar-tarjeta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo eliminar la tarjeta");
        setEliminando(false);
        return;
      }
      setConfirmando(false);
      onEliminada();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setEliminando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: 8, padding: "6px 10px", fontSize: 12.5 }}
        onClick={() => setConfirmando(true)}
      >
        Eliminar tarjeta
      </button>

      {confirmando && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3>Eliminar tarjeta de {patente}</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              Se dará de baja en Transbank y ya no quedará disponible para renovar el plan automáticamente.
            </div>
            {error && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmando(false)} disabled={eliminando}>
                Cancelar
              </button>
              <button type="button" className="btn danger" onClick={eliminar} disabled={eliminando}>
                {eliminando ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
