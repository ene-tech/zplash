"use client";

import { useState } from "react";
import { TELEFONO_FORMATO_MSG, fmtTelefono, formatTelefono, isValidEmail, isValidTelefono } from "@/lib/helpers";

const BTN_CHICO = { marginTop: 0, padding: "6px 10px", fontSize: 12.5 } as const;

async function enviar(body: Record<string, string>): Promise<{ ok: boolean; error?: string; solicitudId?: string }> {
  try {
    const res = await fetch("/api/cliente/mi-cuenta/datos-contacto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...data } : { ok: false, error: data.error || "No se pudo guardar el cambio" };
  } catch {
    return { ok: false, error: "Sin conexión. Intenta de nuevo." };
  }
}

// "Mis datos": el cliente corrige su correo y su teléfono (ver
// /api/cliente/mi-cuenta/datos-contacto). El correo pide el código que le
// llega a la dirección nueva antes de cambiarse, porque es con lo que entra.
export function DatosContactoSection({ email, telefono, onActualizado }: { email: string; telefono: string | null; onActualizado: () => void }) {
  return (
    <>
      <h3 style={{ marginBottom: 12 }}>Mis datos</h3>
      <div className="card" style={{ marginBottom: 26, display: "grid", gap: 16 }}>
        <CampoEmail email={email} onActualizado={onActualizado} />
        <CampoTelefono telefono={telefono} onActualizado={onActualizado} />
      </div>
    </>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase", letterSpacing: 0.8 }}>{children}</div>;
}

function CampoTelefono({ telefono, onActualizado }: { telefono: string | null; onActualizado: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    const t = formatTelefono(valor);
    if (!t || !isValidTelefono(t)) {
      setError(TELEFONO_FORMATO_MSG);
      return;
    }
    setEnviando(true);
    setError("");
    const r = await enviar({ telefono: t });
    setEnviando(false);
    if (!r.ok) {
      setError(r.error || "");
      return;
    }
    setEditando(false);
    onActualizado();
  }

  return (
    <div>
      <Etiqueta>Teléfono</Etiqueta>
      {editando ? (
        <>
          <div className="field" style={{ marginTop: 6, marginBottom: 8 }}>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="+56912345678"
              autoFocus
            />
          </div>
          {error && <div className="err">{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" style={BTN_CHICO} onClick={guardar} disabled={enviando}>
              {enviando ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" className="btn ghost" style={BTN_CHICO} onClick={() => setEditando(false)} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15 }}>{telefono ? fmtTelefono(telefono) : <span style={{ color: "var(--gray)" }}>Sin teléfono</span>}</span>
          <button
            type="button"
            className="btn ghost"
            style={BTN_CHICO}
            onClick={() => {
              setValor(telefono || "+569");
              setError("");
              setEditando(true);
            }}
          >
            {telefono ? "Editar" : "Agregar"}
          </button>
        </div>
      )}
    </div>
  );
}

function CampoEmail({ email, onActualizado }: { email: string; onActualizado: () => void }) {
  const [paso, setPaso] = useState<"ver" | "editar" | "codigo">("ver");
  const [valor, setValor] = useState("");
  const [codigo, setCodigo] = useState("");
  const [solicitudId, setSolicitudId] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function pedirCodigo() {
    const nuevo = valor.trim().toLowerCase();
    if (!isValidEmail(nuevo)) {
      setError("Correo inválido");
      return;
    }
    setEnviando(true);
    setError("");
    const r = await enviar({ email: nuevo });
    setEnviando(false);
    if (!r.ok || !r.solicitudId) {
      setError(r.error || "No se pudo enviar el código");
      return;
    }
    setSolicitudId(r.solicitudId);
    setCodigo("");
    setPaso("codigo");
  }

  async function confirmar() {
    setEnviando(true);
    setError("");
    const r = await enviar({ solicitudId, codigo: codigo.trim() });
    setEnviando(false);
    if (!r.ok) {
      setError(r.error || "");
      return;
    }
    setPaso("ver");
    onActualizado();
  }

  const cancelar = (
    <button type="button" className="btn ghost" style={BTN_CHICO} onClick={() => setPaso("ver")} disabled={enviando}>
      Cancelar
    </button>
  );

  return (
    <div>
      <Etiqueta>Correo (con este entras a tu cuenta)</Etiqueta>
      {paso === "ver" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, wordBreak: "break-all" }}>{email}</span>
          <button
            type="button"
            className="btn ghost"
            style={BTN_CHICO}
            onClick={() => {
              setValor(email);
              setError("");
              setPaso("editar");
            }}
          >
            Editar
          </button>
        </div>
      )}
      {paso === "editar" && (
        <>
          <div className="field" style={{ marginTop: 6, marginBottom: 8 }}>
            <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
          </div>
          <div style={{ color: "var(--gray)", fontSize: 12.5, marginBottom: 8 }}>Te enviaremos un código al correo nuevo para confirmarlo.</div>
          {error && <div className="err">{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" style={BTN_CHICO} onClick={pedirCodigo} disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar código"}
            </button>
            {cancelar}
          </div>
        </>
      )}
      {paso === "codigo" && (
        <>
          <div style={{ fontSize: 13, margin: "6px 0 8px" }}>
            Escribe el código que enviamos a <strong style={{ wordBreak: "break-all" }}>{valor.trim().toLowerCase()}</strong>. Vence en 5 minutos.
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              autoFocus
            />
          </div>
          {error && <div className="err">{error}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" style={BTN_CHICO} onClick={confirmar} disabled={enviando || codigo.length !== 6}>
              {enviando ? "Confirmando..." : "Confirmar"}
            </button>
            <button type="button" className="btn ghost" style={BTN_CHICO} onClick={() => setPaso("editar")} disabled={enviando}>
              Cambiar correo
            </button>
            {cancelar}
          </div>
        </>
      )}
    </div>
  );
}
