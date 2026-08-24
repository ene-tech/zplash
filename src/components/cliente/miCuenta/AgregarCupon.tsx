"use client";

import { useState } from "react";
import type { VehiculoSesion } from "@/lib/sesionCliente";

// Ata a la cuenta un código recibido por fuera (ticket de un Pack Empresa,
// cupón de descuento de una promo) — ver /api/cliente/mi-cuenta/agregar-cupon.
// No lo canjea: el ticket lo sigue consumiendo el operador, y el descuento se
// aplica solo al llegar el auto. El selector de patente aparece únicamente con
// más de un vehículo; con uno solo el backend lo resuelve.
export function AgregarCupon({ vehiculos, onAgregado }: { vehiculos: VehiculoSesion[]; onAgregado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [patente, setPatente] = useState(vehiculos[0]?.patente || "");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!abierto) {
    return (
      <button type="button" className="btn ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={() => setAbierto(true)}>
        + Agregar cupón o ticket
      </button>
    );
  }

  function cerrar() {
    setAbierto(false);
    setCodigo("");
    setError("");
  }

  async function agregar() {
    if (!codigo.trim()) {
      setError("Ingresa el código.");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      const res = await fetch("/api/cliente/mi-cuenta/agregar-cupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, patente }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo agregar el código");
        setEnviando(false);
        return;
      }
      cerrar();
      setEnviando(false);
      onAgregado();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 320 }}>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Código</label>
        <input
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value.toUpperCase());
            setError("");
          }}
          placeholder="Ej. K7M4PQ"
          maxLength={12}
          style={{ textTransform: "uppercase" }}
        />
      </div>
      {vehiculos.length > 1 && (
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Vehículo (si es un descuento)</label>
          <select value={patente} onChange={(e) => setPatente(e.target.value)}>
            {vehiculos.map((v) => (
              <option key={v.patente} value={v.patente}>
                {v.patente}
              </option>
            ))}
          </select>
        </div>
      )}
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
