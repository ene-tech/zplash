"use client";

import { useSyncExternalStore } from "react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { enAppNativa } from "@/lib/appNativa";
import { ActivarAvisosApp } from "./ActivarAvisosApp";

const sinCambios = () => () => {};

// Ofrece activar Web Push (ver public/sw.js y @/lib/push/enviar) como
// alternativa gratuita a los avisos de WhatsApp — se muestra solo mientras
// no está ya activo, y desaparece si el navegador no soporta push (Safari
// viejo, navegadores in-app, etc). Dentro de la app nativa muestra en su
// lugar ActivarAvisosApp (push por Firebase + descuento al pasar cerca).
export function ActivarNotificaciones() {
  // En el servidor siempre false; en el cliente, si corre dentro de la app.
  const nativa = useSyncExternalStore(sinCambios, enAppNativa, () => false);
  return nativa ? <ActivarAvisosApp /> : <ActivarWebPush />;
}

function ActivarWebPush() {
  const { estado, activar } = usePushSubscription();

  if (estado === "cargando" || estado === "no-soportado" || estado === "activo") return null;

  return (
    <div className="card" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div style={{ fontSize: 13, color: "var(--gray)" }}>
        Recibe avisos de tu plan (por vencer, renovaciones) sin costo por notificación, instalando ZPlash como app.
        {estado === "error" && <span style={{ color: "var(--red)" }}> No pudimos activarlas, intenta de nuevo.</span>}
      </div>
      <button type="button" className="btn ghost" style={{ marginTop: 0, flexShrink: 0 }} onClick={activar}>
        Activar notificaciones
      </button>
    </div>
  );
}
