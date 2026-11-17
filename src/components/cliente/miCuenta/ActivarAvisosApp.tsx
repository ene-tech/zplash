"use client";

import { useEffect, useState } from "react";
import { abrirAjustesApp, activarAvisosApp, escucharToquesPush, type EstadoAvisosApp } from "@/lib/appNativa";

// Versión de ActivarNotificaciones para la app nativa: push por Firebase y
// descuento al pasar cerca del local (geocerca). Explica el porqué ANTES de
// que el sistema pida los permisos: Apple y Google lo exigen para la
// ubicación "siempre", y sin explicación la mayoría la niega.
export function ActivarAvisosApp() {
  const [estado, setEstado] = useState<EstadoAvisosApp | null>(null);
  const [cargando, setCargando] = useState(false);
  // Ya tocó "Activar avisos" en esta visita: si igual quedó sin permiso, el
  // sistema no vuelve a mostrar el diálogo y solo queda ir a Ajustes.
  const [intentado, setIntentado] = useState(false);

  // Al abrir Mi Cuenta refresca en silencio lo ya autorizado (el token de
  // Firebase puede cambiar y la zona pudo moverse en Configuración).
  useEffect(() => {
    escucharToquesPush();
    activarAvisosApp(false)
      .then(setEstado)
      .catch(() => setEstado({ push: false, geocerca: "inactiva" }));
  }, []);

  // "inactiva" con push activo = el local todavía no tiene zona configurada
  // (o es iOS, sin geocerca aún): no hay nada que pedirle al cliente.
  if (!estado || (estado.push && (estado.geocerca === "activa" || estado.geocerca === "inactiva"))) return null;

  const activar = async () => {
    setCargando(true);
    setEstado(await activarAvisosApp(true).catch(() => ({ push: false, geocerca: "inactiva" as const })));
    setCargando(false);
    setIntentado(true);
  };

  const faltaFondo = estado.push && (estado.geocerca === "sin_permiso_fondo" || (intentado && estado.geocerca === "sin_permiso"));

  return (
    <div className="card" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div style={{ fontSize: 13, color: "var(--gray)" }}>
        {faltaFondo ? (
          <>
            Para avisarte de descuentos cuando pases cerca de ZPlash, en Ajustes → Permisos → Ubicación elige <b>Permitir todo el tiempo</b>. Solo
            usamos tu ubicación para saber si estás cerca del local; no la guardamos.
          </>
        ) : (
          <>
            Activa los avisos: te contamos cuando tu plan está por vencer y, si pasas cerca de ZPlash, te avisamos si tienes un
            descuento esperándote. Solo usamos tu ubicación para saber si estás cerca del local; no la guardamos.
          </>
        )}
      </div>
      <button type="button" className="btn ghost" style={{ marginTop: 0, flexShrink: 0 }} disabled={cargando} onClick={faltaFondo ? abrirAjustesApp : activar}>
        {faltaFondo ? "Abrir Ajustes" : cargando ? "Activando..." : "Activar avisos"}
      </button>
    </div>
  );
}
