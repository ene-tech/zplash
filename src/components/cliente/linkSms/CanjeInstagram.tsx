"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Pasos de /ig/[codigo]: patente → datos que falten (registro o corrección de
// celular/correo) → código enviado al correo → al pago de /v/[codigo]. Qué se
// pide lo decide el servidor en cada paso (ver canjearLinkInstagram).

type Faltan = { nombre: boolean; telefono: boolean; email: boolean };
type Respuesta =
  | { estado: "listo"; codigo: string }
  | { estado: "datos"; faltan: Faltan; nuevo: boolean }
  | { estado: "codigo"; solicitudId: string; email: string }
  | { estado: "error"; error: string };

export default function CanjeInstagram({ codigo }: { codigo: string }) {
  const router = useRouter();
  const [patente, setPatente] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("+569");
  const [email, setEmail] = useState("");
  const [faltan, setFaltan] = useState<Faltan | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [solicitud, setSolicitud] = useState<{ id: string; email: string } | null>(null);
  const [codigoCorreo, setCodigoCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");

  async function enviar(extra: Record<string, string> = {}) {
    setErr("");
    setEnviando(true);
    try {
      const body: Record<string, string> = { patente, ...extra };
      if (faltan?.nombre) body.nombre = nombre;
      if (faltan?.telefono) body.telefono = telefono;
      if (faltan?.email) body.email = email;
      const res = await fetch(`/api/ig/${codigo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: Respuesta = await res.json();
      if (data.estado === "listo") {
        router.push(`/v/${data.codigo}`);
        return;
      }
      if (data.estado === "datos") {
        setFaltan(data.faltan);
        setNuevo(data.nuevo);
        setSolicitud(null);
      } else if (data.estado === "codigo") {
        setSolicitud({ id: data.solicitudId, email: data.email });
      } else {
        setErr(data.error);
      }
    } catch {
      setErr("Sin conexión. Revisa tu internet e intenta de nuevo.");
    }
    setEnviando(false);
  }

  if (solicitud) {
    return (
      <>
        <h2>Revisa tu correo</h2>
        <p className="hint">Te mandamos un código de 6 dígitos a {solicitud.email}.</p>
        <div className="card">
          <div className="field">
            <input
              value={codigoCorreo}
              onChange={(e) => setCodigoCorreo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Código"
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={enviando || codigoCorreo.length !== 6}
            onClick={() => enviar({ solicitudId: solicitud.id, codigoVerificacion: codigoCorreo })}
          >
            {enviando ? "Activando..." : "Activar mi descuento"}
          </button>
          <button type="button" className="link-sms-alt" disabled={enviando} onClick={() => setSolicitud(null)}>
            Cambiar el correo
          </button>
          <div className="err" role="alert">
            {err}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h2>$2.000 de descuento por seguirnos</h2>
      <p className="hint">Para tu Lavado Full Túnel o tu plan, pagando en la web.</p>
      <div className="card">
        <div className="field">
          <label htmlFor="ig-patente">Patente</label>
          <input
            id="ig-patente"
            value={patente}
            onChange={(e) => {
              setPatente(e.target.value.toUpperCase());
              setFaltan(null);
            }}
            placeholder="ABCD12"
            autoCapitalize="characters"
            disabled={enviando}
          />
        </div>

        {faltan && (
          <>
            <p className="hint">
              {nuevo ? "Regístrate para activar tu descuento:" : "Actualiza tus datos para activar tu descuento:"}
            </p>
            {faltan.nombre && (
              <div className="field">
                <label htmlFor="ig-nombre">Tu nombre</label>
                <input id="ig-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
              </div>
            )}
            {faltan.telefono && (
              <div className="field">
                <label htmlFor="ig-telefono">Celular</label>
                <input id="ig-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" autoComplete="tel" />
              </div>
            )}
            {faltan.email && (
              <div className="field">
                <label htmlFor="ig-email">Correo</label>
                <input id="ig-email" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoComplete="email" />
                <span className="hint">Te mandaremos un código para confirmarlo.</span>
              </div>
            )}
          </>
        )}

        <button type="button" className="btn" disabled={enviando || !patente.trim()} onClick={() => enviar()}>
          {enviando ? "Revisando..." : faltan ? "Continuar" : "Activar mi descuento"}
        </button>
        <div className="err" role="alert">
          {err}
        </div>
      </div>
    </>
  );
}
