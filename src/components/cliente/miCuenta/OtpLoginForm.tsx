"use client";

import { useState } from "react";
import { PATENTE_FORMATO_MSG, isValidPatente, normPlate } from "@/lib/helpers";

// Login del Portal Cliente: código de un solo uso por correo (ver
// @/app/api/cliente/otp), en vez de la cuenta de Google que mostraba antes
// esta pantalla (nunca llegó a conectarse de verdad) o del WhatsApp que se
// usó después (plantilla paga). Dos pasos: pedir el código (por patente o
// correo) y verificarlo.
//
// El modo "registro" reusa esos MISMOS dos pasos para un cliente que todavía
// no existe: manda nombre + correo + patente, el código se envía al correo que
// declaró y la ficha se crea recién al verificarlo (ver otp/verificar).

// El correo ya llega enmascarado desde /api/cliente/otp/solicitar y solo se
// usa para mostrarlo: el backend nunca lo devuelve en limpio, y verificar el
// código va con `solicitudId` (opaco, de un solo uso) en vez del correo.
export function OtpLoginForm({ onSuccess, registro = false }: { onSuccess: () => void; registro?: boolean }) {
  const [paso, setPaso] = useState<"pedir" | "verificar">("pedir");
  const [modo, setModo] = useState<"patente" | "email" | "registro">(registro ? "registro" : "patente");
  const [valor, setValor] = useState("");
  const [nombre, setNombre] = useState("");
  const [patenteNueva, setPatenteNueva] = useState("");
  const [emailDestino, setEmailDestino] = useState("");
  const [solicitudId, setSolicitudId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const esRegistro = modo === "registro";

  function cambiarModo(nuevo: "patente" | "email" | "registro") {
    setModo(nuevo);
    setValor("");
    setNombre("");
    setPatenteNueva("");
    setError("");
  }

  async function pedirCodigo() {
    if (!valor.trim()) return;
    if (esRegistro) {
      if (!nombre.trim()) {
        setError("Ingresa tu nombre.");
        return;
      }
      if (!isValidPatente(patenteNueva)) {
        setError(PATENTE_FORMATO_MSG);
        return;
      }
    }
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/otp/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          esRegistro
            ? { nombre: nombre.trim(), email: valor.trim(), patente: normPlate(patenteNueva) }
            : modo === "patente"
              ? { patente: valor.trim() }
              : { email: valor.trim() }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo enviar el código");
        return;
      }
      setEmailDestino(data.email);
      setSolicitudId(data.solicitudId);
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
        body: JSON.stringify({
          solicitudId,
          codigo,
          // El backend crea la ficha solo si vienen estos dos (ver verificar).
          ...(esRegistro ? { nombre: nombre.trim(), patente: normPlate(patenteNueva) } : {}),
        }),
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
          Te enviamos un código de 6 dígitos por correo a <strong>{emailDestino}</strong>. Vence en 5
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
          {enviando ? "Verificando..." : esRegistro ? "Crear mi cuenta" : "Verificar código"}
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
      <h3>{esRegistro ? "Crear mi cuenta" : "Mi Cuenta"}</h3>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
        {esRegistro
          ? "Déjanos tu nombre, correo y patente. Te mandamos un código por correo para confirmar que es tuyo."
          : "Ingresa con tu patente o tu correo y te mandamos un código por correo para verificar que eres tú."}
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className={modo === "patente" ? "btn" : "btn ghost"}
          style={{ marginTop: 0, padding: "6px 14px", fontSize: 12.5 }}
          onClick={() => cambiarModo("patente")}
        >
          Por patente
        </button>
        <button
          type="button"
          className={modo === "email" ? "btn" : "btn ghost"}
          style={{ marginTop: 0, padding: "6px 14px", fontSize: 12.5 }}
          onClick={() => cambiarModo("email")}
        >
          Por correo
        </button>
        <button
          type="button"
          className={esRegistro ? "btn" : "btn ghost"}
          style={{ marginTop: 0, padding: "6px 14px", fontSize: 12.5 }}
          onClick={() => cambiarModo("registro")}
        >
          Soy nuevo
        </button>
      </div>
      {esRegistro && (
        <>
          <div className="field" style={{ marginBottom: 12 }}>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <input
              value={patenteNueva}
              onChange={(e) => setPatenteNueva(e.target.value.toUpperCase())}
              placeholder="Patente (AB1234)"
              style={{ textTransform: "uppercase" }}
            />
          </div>
        </>
      )}
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
