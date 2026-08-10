"use client";

import { useState } from "react";
import { isValidEmail } from "@/lib/helpers";
import { redirigirAInscripcionOneclick } from "@/lib/webpayClient";
import type { VehiculoSesion } from "@/lib/sesionCliente";

// Inscribe una tarjeta Oneclick sin pasar por una compra: a diferencia de la
// "renovación automática" de /pagar (donde inscribir = pagar un ciclo ya
// mismo), esto solo guarda la tarjeta. /api/pagos/oneclick/inscripcion/
// retorno no cobra nada al volver de Transbank — ver el comentario ahí sobre
// "pendiente_solo_tarjeta".
export function AgregarTarjeta({ vehiculos, emailDefault }: { vehiculos: VehiculoSesion[]; emailDefault: string }) {
  const [abierto, setAbierto] = useState(false);
  const [patente, setPatente] = useState(vehiculos[0]?.patente ?? "");
  const [email, setEmail] = useState(emailDefault);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  if (vehiculos.length === 0) return null;

  if (!abierto) {
    return (
      <button type="button" className="btn ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={() => setAbierto(true)}>
        + Agregar tarjeta
      </button>
    );
  }

  async function inscribir() {
    if (!isValidEmail(email)) {
      setError("Email inválido.");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      const res = await fetch("/api/pagos/oneclick/inscribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente, email, soloGuardar: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar la inscripción");
        setEnviando(false);
        return;
      }
      redirigirAInscripcionOneclick(data.url, data.token);
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 320 }}>
      <p style={{ color: "var(--gray)", fontSize: 12.5, marginBottom: 10 }}>
        Vas a un formulario seguro de Transbank para guardar tu tarjeta. No se hace ningún cobro ahora.
      </p>
      {vehiculos.length > 1 && (
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Vehículo</label>
          <select value={patente} onChange={(e) => setPatente(e.target.value)}>
            {vehiculos.map((v) => (
              <option key={v.patente} value={v.patente}>
                {v.patente}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Email (para confirmar la inscripción)</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.cl" />
      </div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn" style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }} onClick={inscribir} disabled={enviando}>
          {enviando ? "Redirigiendo..." : "Inscribir tarjeta"}
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }}
          onClick={() => setAbierto(false)}
          disabled={enviando}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
