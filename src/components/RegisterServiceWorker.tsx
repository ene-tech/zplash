"use client";

import { useEffect } from "react";

// Registra el service worker en toda la app (antes solo se registraba desde
// Mi Cuenta al activar notificaciones push). Ver public/sw.js: el fetch
// handler ahí es intencionalmente conservador, así que registrarlo acá no
// arriesga servir JS/HTML viejo después de un deploy.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("No se pudo registrar el service worker", error);
    });
  }, []);

  return null;
}
