"use client";

import { useCallback, useEffect, useState } from "react";

type EstadoPush = "cargando" | "no-soportado" | "inactivo" | "activo" | "error";

// applicationServerKey exige un Uint8Array, no el string base64url que
// entrega VAPID — conversión estándar de la spec de Web Push.
function claveVapidComoBytes(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushSubscription(endpointSuscribir: string = "/api/cliente/push/suscribir") {
  const [estado, setEstado] = useState<EstadoPush>("cargando");

  useEffect(() => {
    let cancelado = false;
    const soportado = "serviceWorker" in navigator && "PushManager" in window;
    const consulta = soportado
      ? navigator.serviceWorker.getRegistration("/sw.js").then((registro) => registro?.pushManager.getSubscription())
      : Promise.resolve(undefined);
    consulta.then((suscripcion) => {
      if (cancelado) return;
      setEstado(!soportado ? "no-soportado" : suscripcion ? "activo" : "inactivo");
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const activar = useCallback(async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setEstado("error");
      return;
    }
    try {
      const registro = await navigator.serviceWorker.register("/sw.js");
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado("error");
        return;
      }
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveVapidComoBytes(vapidKey) as BufferSource,
      });
      const json = suscripcion.toJSON();
      await fetch(endpointSuscribir, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setEstado("activo");
    } catch (error) {
      console.error("Error activando notificaciones push", error);
      setEstado("error");
    }
  }, [endpointSuscribir]);

  return { estado, activar };
}
