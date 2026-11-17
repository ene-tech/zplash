"use client";

import { useState } from "react";

// "Eliminar mi cuenta" (lo exigen Google Play y la App Store). Es inmediato
// (ver /api/cliente/mi-cuenta/eliminar-cuenta): el modal dice todo lo que se
// pierde y pide escribir ELIMINAR, para que no se haga con un toque al pasar.
export function EliminarCuenta({ onEliminada }: { onEliminada: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");

  async function eliminar() {
    setEliminando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/mi-cuenta/eliminar-cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar: "ELIMINAR" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo eliminar la cuenta");
        setEliminando(false);
        return;
      }
      setAbierto(false);
      onEliminada();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setEliminando(false);
    }
  }

  return (
    <>
      <button type="button" className="btn ghost" style={{ marginTop: 0, color: "var(--red)" }} onClick={() => setAbierto(true)}>
        Eliminar mi cuenta
      </button>
      {abierto && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3>Eliminar mi cuenta</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              Se elimina ahora mismo y no se puede deshacer:
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                <li>Borramos tu correo, nombre, teléfono y datos de factura.</li>
                <li>Damos de baja tu tarjeta guardada y el cobro automático de tu plan.</li>
                <li>Tus tickets y cupones ya no se verán en ninguna cuenta.</li>
              </ul>
              <p style={{ margin: "10px 0 0", color: "var(--gray)", fontSize: 13 }}>
                Solo conservamos las ventas y boletas que la ley obliga a guardar. Te enviaremos un correo de confirmación.
              </p>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="confirmar-eliminar">Escribe ELIMINAR para confirmar</label>
              <input
                id="confirmar-eliminar"
                value={texto}
                onChange={(e) => setTexto(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
              />
            </div>
            {error && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setAbierto(false)} disabled={eliminando}>
                Cancelar
              </button>
              <button type="button" className="btn danger" onClick={eliminar} disabled={eliminando || texto.trim() !== "ELIMINAR"}>
                {eliminando ? "Eliminando..." : "Eliminar mi cuenta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
