"use client";

import { useState } from "react";
import { fmtFecha, isValidPatente, normPlate, PATENTE_FORMATO_MSG } from "@/lib/helpers";

// Solo aplica a vehículos con un plan mensual vigente: el cambio de patente
// no es inmediato porque el plan ya está pagado/activo para el mes en curso
// bajo la patente actual — se hace efectivo recién cuando ese mes termina y
// empieza el siguiente (ver resolverPatentePendiente en @/lib/helpers, que
// aplica esto tanto para renovaciones propias como para las que sigue
// cobrando WooCommerce — ver /api/webhooks/woocommerce/route.ts). Llama a
// /api/cliente/mi-cuenta/{solicitar,cancelar}-cambio-patente (sesión por
// cookie OTP), mismo patrón que QuitarVehiculo/EliminarTarjeta.
//
// El trigger del formulario ("Solicitar cambio de patente") vive en el menú
// "⋮" de VehiculoCard — `abierto`/`onCerrar` lo controlan desde ahí. El
// aviso de solicitud pendiente, en cambio, se muestra siempre que exista,
// sin pasar por el menú.
export function SolicitudCambioPatente({
  patente,
  plan,
  vencimiento,
  patentePendiente,
  patentePendienteDesde,
  abierto,
  onCerrar,
  onActualizado,
}: {
  patente: string;
  plan: string;
  vencimiento: string | null;
  patentePendiente: string | null;
  patentePendienteDesde: string | null;
  abierto: boolean;
  onCerrar: () => void;
  onActualizado: () => void;
}) {
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function cancelar() {
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/mi-cuenta/cancelar-cambio-patente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo cancelar la solicitud");
        setEnviando(false);
        return;
      }
      onActualizado();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setEnviando(false);
    }
  }

  if (patentePendiente) {
    return (
      <div style={{ marginTop: 8 }}>
        <p style={{ color: "var(--gray)", fontSize: 12.5, marginBottom: 6 }}>
          Solicitaste cambiar tu patente a <strong>{patentePendiente}</strong>. El cambio se aplicará
          automáticamente a tu plan cuando termine tu mes actual{vencimiento ? ` (vence el ${fmtFecha(vencimiento)})` : ""} e
          inicie el próximo — hasta esa fecha tu plan sigue funcionando con la patente {patente}
          {patentePendienteDesde ? ` (solicitado el ${new Date(patentePendienteDesde).toLocaleDateString("es-CL")})` : ""}.
        </p>
        {error && <div className="err">{error}</div>}
        <button type="button" className="btn ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={cancelar} disabled={enviando}>
          {enviando ? "Cancelando..." : "Cancelar solicitud"}
        </button>
      </div>
    );
  }

  if (!abierto) return null;

  const pedirConfirmacion = () => {
    if (!isValidPatente(nueva)) {
      setError(PATENTE_FORMATO_MSG);
      return;
    }
    if (normPlate(nueva) === normPlate(patente)) {
      setError("Esa ya es tu patente actual.");
      return;
    }
    setConfirmando(true);
  };

  async function confirmar() {
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/mi-cuenta/solicitar-cambio-patente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente, nuevaPatente: nueva }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar la solicitud");
        setEnviando(false);
        setConfirmando(false);
        return;
      }
      setConfirmando(false);
      setNueva("");
      onCerrar();
      onActualizado();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div className="field" style={{ marginBottom: 6 }}>
        <input
          value={nueva}
          onChange={(e) => {
            setNueva(e.target.value.toUpperCase());
            setError("");
          }}
          placeholder="Nueva patente (ej. AB1234)"
          maxLength={6}
          style={{ textTransform: "uppercase" }}
        />
      </div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn" style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }} onClick={pedirConfirmacion}>
          Confirmar
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }}
          onClick={() => {
            setNueva("");
            setError("");
            onCerrar();
          }}
        >
          Cancelar
        </button>
      </div>

      {confirmando && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3>Confirmar cambio de patente</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              ¿Estás seguro que deseas cambiar tu <strong>{plan}</strong> de tu vehículo patente{" "}
              <strong>{patente}</strong> a tu patente <strong>{normPlate(nueva)}</strong>?
            </div>
            {error && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmando(false)} disabled={enviando}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={confirmar} disabled={enviando}>
                {enviando ? "Guardando..." : "Sí, cambiar patente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
