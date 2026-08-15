"use client";

import { useState } from "react";

// Deja de mostrar esta patente en "Mis vehículos" (ver
// /api/cliente/mi-cuenta/quitar-vehiculo): no cancela el plan ni borra el
// historial de compras de ese vehículo, solo lo desvincula de esta cuenta —
// mismo criterio de "cuenta" que usa el login por OTP (clientes.email no es
// único, un correo puede resolver a varias patentes).
//
// Controlado desde VehiculoCard (menú "⋮" de la tarjeta): el trigger vive
// en el DropdownMenu, este componente solo pinta el modal de confirmación
// cuando `abierto` es true.
export function QuitarVehiculo({
  patente,
  abierto,
  onCerrar,
  onQuitado,
}: {
  patente: string;
  abierto: boolean;
  onCerrar: () => void;
  onQuitado: () => void;
}) {
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
      setQuitando(false);
      onCerrar();
      onQuitado();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setQuitando(false);
    }
  }

  if (!abierto) return null;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 400 }}>
        <h3>Quitar patente {patente}</h3>
        <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
          Este vehículo dejará de aparecer en tu cuenta. Su plan y su historial de compras no se
          cancelan ni se eliminan — si más adelante lo necesitas de vuelta, contáctanos.
        </div>
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCerrar} disabled={quitando}>
            Cancelar
          </button>
          <button type="button" className="btn danger" onClick={quitar} disabled={quitando}>
            {quitando ? "Quitando..." : "Sí, quitar"}
          </button>
        </div>
      </div>
    </div>
  );
}
