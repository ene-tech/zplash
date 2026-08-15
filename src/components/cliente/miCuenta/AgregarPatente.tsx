"use client";

import { useState } from "react";
import { isValidPatente, normPlate, PATENTE_FORMATO_MSG } from "@/lib/helpers";

// Suma un vehículo a la cuenta (sin plan todavía si es de cero) — ver
// /api/cliente/mi-cuenta/agregar-vehiculo. A diferencia de
// SolicitudCambioPatente, esto no reemplaza ningún vehículo existente: crea
// uno desde cero (mismo criterio que un alta por WhatsApp) o, si la patente
// ya existe pero está huérfana (sin dueño activo), la reclama para esta
// cuenta. Con dueño activo el backend igual la rechaza.
export function AgregarPatente({ onAgregado }: { onAgregado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [patente, setPatente] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!abierto) {
    return (
      <button type="button" className="btn ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={() => setAbierto(true)}>
        + Agregar Vehiculo - Inscribir Nueva Patente
      </button>
    );
  }

  function cerrar() {
    setAbierto(false);
    setPatente("");
    setNombre("");
    setError("");
  }

  async function agregar() {
    if (!isValidPatente(patente)) {
      setError(PATENTE_FORMATO_MSG);
      return;
    }
    if (!nombre.trim()) {
      setError("Ingresa un nombre referencial para el vehículo.");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      const res = await fetch("/api/cliente/mi-cuenta/agregar-vehiculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente: normPlate(patente), nombre }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo agregar la patente");
        setEnviando(false);
        return;
      }
      cerrar();
      onAgregado();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 320 }}>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Patente</label>
        <input
          value={patente}
          onChange={(e) => {
            setPatente(e.target.value.toUpperCase());
            setError("");
          }}
          placeholder="Ej. AB1234"
          maxLength={6}
          style={{ textTransform: "uppercase" }}
        />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Nombre Referencial (Auto/Modelo)</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Auto de Juan / Toyota Yaris" />
      </div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn" style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }} onClick={agregar} disabled={enviando}>
          {enviando ? "Agregando..." : "Agregar"}
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }}
          onClick={cerrar}
          disabled={enviando}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
