"use client";

import { useCallback, useEffect, useState } from "react";
import type { SesionCliente } from "@/lib/sesionCliente";

// A diferencia de la versión anterior (localStorage + useSyncExternalStore),
// la sesión real vive en una cookie httpOnly del servidor: este hook solo
// refleja lo que devuelve GET /api/cliente/sesion. `sesion === undefined`
// mientras está cargando, para que MiCuentaTab no muestre el formulario de
// login por un instante antes de confirmar que sí hay sesión vigente.
export function useSesionCliente() {
  const [sesion, setSesion] = useState<SesionCliente | null | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/cliente/sesion")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelado) setSesion(data);
      })
      .catch(() => {
        if (!cancelado) setSesion(null);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const refrescar = useCallback(async () => {
    try {
      const res = await fetch("/api/cliente/sesion");
      setSesion(res.ok ? await res.json() : null);
    } catch {
      setSesion(null);
    }
  }, []);

  const cerrar = useCallback(async () => {
    await fetch("/api/cliente/logout", { method: "POST" });
    setSesion(null);
  }, []);

  return { sesion, cargando: sesion === undefined, refrescar, cerrar };
}
