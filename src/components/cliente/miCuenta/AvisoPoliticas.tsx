"use client";

import { useState } from "react";

// Aviso de aceptación de las "Políticas de Funcionamiento y Garantía" (ver
// @/lib/politicas). Mismo formato que ActivarNotificaciones (.card con texto
// + botón a la derecha), pero con borde dorado y sin descarte local: esto no
// es un aviso informativo que se pueda cerrar, se queda hasta que el cliente
// acepte, y la aceptación vive en la base (no en localStorage) porque es el
// registro que hay que poder mostrar si alguien reclama.
export function AvisoPoliticas({ onAceptado }: { onAceptado: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(false);

  async function aceptar() {
    setEnviando(true);
    setError(false);
    try {
      const res = await fetch("/api/cliente/mi-cuenta/aceptar-politicas", { method: "POST" });
      if (!res.ok) throw new Error();
      onAceptado();
    } catch {
      setError(true);
      setEnviando(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: 20,
        borderColor: "var(--gold)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 13, color: "var(--gray)" }}>
        <strong style={{ color: "var(--gold)" }}>Revisa y acepta nuestras políticas.</strong> Antes de seguir usando tu cuenta, lee las{" "}
        <a href="/politicas" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>
          Políticas de Funcionamiento y Garantía
        </a>{" "}
        (plan, uso del túnel, garantía de relavado, pagos y renovación automática).
        {error && <span style={{ color: "var(--red)" }}> No pudimos registrar tu aceptación, intenta de nuevo.</span>}
      </div>
      <button type="button" className="btn" style={{ marginTop: 0, flexShrink: 0 }} disabled={enviando} onClick={aceptar}>
        {enviando ? "Guardando…" : "He leído y acepto"}
      </button>
    </div>
  );
}
