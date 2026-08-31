"use client";

import { useState } from "react";

// Deja esta tarjeta cobrando también los otros autos de la cuenta, sin volver
// a pasar por Transbank — ver /api/cliente/mi-cuenta/compartir-tarjeta. Solo
// se ofrece cuando hay algún auto sin tarjeta propia: cambiarle el medio de
// pago a uno que ya tiene la suya se hace inscribiendo de nuevo.
export function CompartirTarjeta({ patente, cuantosSinTarjeta, onCompartida }: { patente: string; cuantosSinTarjeta: number; onCompartida: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  if (cuantosSinTarjeta < 1) return null;

  async function compartir() {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/mi-cuenta/compartir-tarjeta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo usar la tarjeta en los otros autos");
        setGuardando(false);
        return;
      }
      setConfirmando(false);
      setGuardando(false);
      onCompartida();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setGuardando(false);
    }
  }

  const plural = cuantosSinTarjeta > 1;

  return (
    <>
      <button type="button" className="btn ghost" style={{ marginTop: 8, padding: "6px 10px", fontSize: 12.5 }} onClick={() => setConfirmando(true)}>
        Usar en mis otros autos
      </button>

      {confirmando && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3>Usar esta tarjeta en tus otros autos</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              La tarjeta de {patente} queda también para {plural ? `los otros ${cuantosSinTarjeta} autos` : "tu otro auto"} de la cuenta, sin
              volver a registrarla. Cada auto mantiene su propia fecha de cobro: se le cobra cuando le toque renovar, no ahora.
            </div>
            <div style={{ color: "var(--gray)", fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
              Los autos que ya tienen su propia tarjeta no se tocan.
            </div>
            {error && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmando(false)} disabled={guardando}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={compartir} disabled={guardando}>
                {guardando ? "Guardando..." : "Sí, usar en todos"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
