"use client";

import { useState } from "react";

// Login del Portal Cliente: código de un solo uso por correo (ver
// @/app/api/cliente/otp), en vez de la cuenta de Google que mostraba antes
// esta pantalla (nunca llegó a conectarse de verdad) o del WhatsApp que se
// usó después (plantilla paga). Dos pasos: pedir el código (por patente o
// correo) y verificarlo.

// Oculta parte del correo antes de mostrarlo en pantalla (el correo completo
// sigue viajando al backend para verificar el código, esto es solo display).
function ocultarEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return email;
  // Con 2 caracteres o menos, mostrar cualquier prefijo deja el usuario
  // completo a la vista (ej. "jo@..." -> "jo***@..."): para esos casos no se
  // muestra ningún carácter, en vez de reventar el propósito de la función.
  if (usuario.length <= 2) return `${"*".repeat(usuario.length)}@${dominio}`;
  const visible = usuario.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(usuario.length - visible.length, 3))}@${dominio}`;
}

export function OtpLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [paso, setPaso] = useState<"pedir" | "verificar">("pedir");
  const [modo, setModo] = useState<"patente" | "email">("patente");
  const [valor, setValor] = useState("");
  const [emailDestino, setEmailDestino] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function pedirCodigo() {
    if (!valor.trim()) return;
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/otp/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modo === "patente" ? { patente: valor.trim() } : { email: valor.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo enviar el código");
        return;
      }
      setEmailDestino(data.email);
      setPaso("verificar");
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  async function verificarCodigo() {
    if (!/^\d{6}$/.test(codigo)) {
      setError("El código tiene 6 dígitos.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/otp/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailDestino, codigo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Código incorrecto");
        return;
      }
      onSuccess();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (paso === "verificar") {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        <h3>Ingresa el código</h3>
        <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
          Te enviamos un código de 6 dígitos por correo a <strong>{ocultarEmail(emailDestino)}</strong>. Vence en 5
          minutos.
        </p>
        <div className="field" style={{ marginBottom: 12 }}>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            style={{ textAlign: "center", fontSize: 20, letterSpacing: 4 }}
          />
        </div>
        {error && <div className="err">{error}</div>}
        <button type="button" className="btn" onClick={verificarCodigo} disabled={enviando}>
          {enviando ? "Verificando..." : "Verificar código"}
        </button>
        <p style={{ marginTop: 14 }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPaso("pedir");
              setCodigo("");
              setError("");
            }}
            style={{ color: "var(--gold)", fontSize: 12.5 }}
          >
            Volver
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
      <h3>Mi Cuenta</h3>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
        Ingresa con tu patente o tu correo y te mandamos un código por correo para verificar que eres tú.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "center" }}>
        <button
          type="button"
          className={modo === "patente" ? "btn" : "btn ghost"}
          style={{ marginTop: 0, padding: "6px 14px", fontSize: 12.5 }}
          onClick={() => {
            setModo("patente");
            setValor("");
            setError("");
          }}
        >
          Por patente
        </button>
        <button
          type="button"
          className={modo === "email" ? "btn" : "btn ghost"}
          style={{ marginTop: 0, padding: "6px 14px", fontSize: 12.5 }}
          onClick={() => {
            setModo("email");
            setValor("");
            setError("");
          }}
        >
          Por correo
        </button>
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <input
          value={valor}
          onChange={(e) => setValor(modo === "patente" ? e.target.value.toUpperCase() : e.target.value)}
          placeholder={modo === "patente" ? "AB1234" : "correo@ejemplo.com"}
          style={modo === "patente" ? { textTransform: "uppercase" } : undefined}
          onKeyDown={(e) => e.key === "Enter" && pedirCodigo()}
        />
      </div>
      {error && <div className="err">{error}</div>}
      <button type="button" className="btn" onClick={pedirCodigo} disabled={enviando}>
        {enviando ? "Enviando..." : "Enviarme un código por correo"}
      </button>
    </div>
  );
}
