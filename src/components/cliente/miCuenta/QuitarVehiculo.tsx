"use client";

import { useState } from "react";

// Deja de mostrar esta patente en "Mis vehículos" (ver
// /api/cliente/mi-cuenta/quitar-vehiculo): no cancela el plan ni borra el
// historial de compras de ese vehículo, solo lo desvincula de esta cuenta —
// mismo criterio de "cuenta" que usa el login por OTP (clientes.email no es
// único, un correo puede resolver a varias patentes).
export function QuitarVehiculo({ patente, onQuitado }: { patente: string; onQuitado: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState("");

  async function quitar() {
    setQuitando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/mi-cuenta/quitar-vehiculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo quitar el vehículo");
        setQuitando(false);
        return;
      }
      setConfirmando(false);
      onQuitado();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setQuitando(false);
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
        Quitar de mi cuenta
      </button>

      {confirmando && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3>Quitar patente {patente}</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              Este vehículo dejará de aparecer en tu cuenta. Su plan y su historial de compras no se
              cancelan ni se eliminan — si más adelante lo necesitas de vuelta, contáctanos.
            </div>
            {error && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmando(false)} disabled={quitando}>
                Cancelar
              </button>
              <button type="button" className="btn danger" onClick={quitar} disabled={quitando}>
                {quitando ? "Quitando..." : "Sí, quitar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
