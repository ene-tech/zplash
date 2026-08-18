"use client";

import { useState } from "react";

// Da de baja el plan de esta patente (ver /api/cliente/mi-cuenta/eliminar-plan):
// el vehículo sigue en la cuenta y con su historial, lo que se elimina es el
// plan. Solo se ofrece con el plan vencido — mientras siga vigente no hay nada
// que dar de baja, y mientras el cliente no lo elimine puede pagarlo cuando
// quiera desde la misma tarjeta.
//
// Controlado desde VehiculoCard (menú "⋮"), mismo patrón que QuitarVehiculo:
// el trigger vive en el DropdownMenu y esto solo pinta la confirmación.
export function EliminarPlan({
  patente,
  plan,
  abierto,
  onCerrar,
  onEliminado,
}: {
  patente: string;
  plan: string;
  abierto: boolean;
  onCerrar: () => void;
  onEliminado: () => void;
}) {
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");

  async function eliminar() {
    setEliminando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/mi-cuenta/eliminar-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo eliminar el plan");
        setEliminando(false);
        return;
      }
      setEliminando(false);
      onCerrar();
      onEliminado();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setEliminando(false);
    }
  }

  if (!abierto) return null;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 400 }}>
        <h3>Eliminar plan de {patente}</h3>
        <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
          Tu {plan} vencido se dará de baja y esta patente quedará sin plan. Si tienes una tarjeta
          guardada para este vehículo, también se da de baja para que no se te cobre. El vehículo y
          tu historial de compras se mantienen — si quieres volver, tendrás que contratar el plan de
          nuevo.
        </div>
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCerrar} disabled={eliminando}>
            Cancelar
          </button>
          <button type="button" className="btn danger" onClick={eliminar} disabled={eliminando}>
            {eliminando ? "Eliminando..." : "Sí, eliminar plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
