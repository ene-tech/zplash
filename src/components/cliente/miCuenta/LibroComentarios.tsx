"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "@/lib/helpers";
import { LIBRO_MENSAJE_MAX, TIPOS_LIBRO, TIPO_LIBRO_LABELS, TIPO_LIBRO_TONE, type LibroComentario, type TipoLibro } from "@/types";

// Libro de reclamos, sugerencias y felicitaciones: el cliente escribe y abajo
// queda su historial (solo el propio — el libro completo lo lee el panel en
// LibroView). Ver /api/cliente/libro.
export function LibroComentarios() {
  const [comentarios, setComentarios] = useState<LibroComentario[]>([]);
  const [tipo, setTipo] = useState<TipoLibro>("sugerencia");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const cargar = useCallback(() => {
    fetch("/api/cliente/libro")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { comentarios: LibroComentario[] } | null) => {
        if (data) setComentarios(data.comentarios);
      })
      // Sin conexión el historial simplemente no aparece; el formulario sigue
      // usable y enviar() tiene su propio manejo de error.
      .catch(() => {});
  }, []);

  useEffect(cargar, [cargar]);

  async function enviar() {
    if (!mensaje.trim()) {
      // También apaga el "¡Recibido!" de un envío anterior: sin esto, error y
      // agradecimiento quedaban en pantalla a la vez.
      setEnviado(false);
      setError("Escribe tu mensaje antes de enviarlo.");
      return;
    }
    setError("");
    setEnviando(true);
    setEnviado(false);
    try {
      const res = await fetch("/api/cliente/libro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, mensaje }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo enviar. Intenta de nuevo.");
        return;
      }
      setMensaje("");
      setEnviado(true);
      cargar();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ marginBottom: 26 }}>
      <h3 style={{ marginBottom: 12 }}>Libro de reclamos, sugerencias y felicitaciones</h3>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoLibro)}>
            {TIPOS_LIBRO.map((t) => (
              <option key={t} value={t}>
                {TIPO_LIBRO_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Mensaje</label>
          <textarea
            rows={4}
            maxLength={LIBRO_MENSAJE_MAX}
            value={mensaje}
            onChange={(e) => {
              setMensaje(e.target.value);
              setError("");
              setEnviado(false);
            }}
            placeholder="Cuéntanos qué pasó, qué mejorarías o qué te gustó."
          />
        </div>
        {error && <div className="err">{error}</div>}
        {enviado && <div style={{ color: "var(--green)", fontSize: 13, marginBottom: 8 }}>¡Recibido! Gracias por escribirnos.</div>}
        <button type="button" className="btn" style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }} onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando..." : "Enviar"}
        </button>
      </div>
      {comentarios.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {comentarios.map((com) => (
            <div className="card" key={com.id} style={{ maxWidth: 560 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span className={`status-pill ${TIPO_LIBRO_TONE[com.tipo]}`}>{TIPO_LIBRO_LABELS[com.tipo]}</span>
                <span style={{ color: "var(--gray)", fontSize: 12.5 }}>{fmtDate(com.creadoEn)}</span>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>{com.mensaje}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
