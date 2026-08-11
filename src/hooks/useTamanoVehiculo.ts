"use client";

import { useCallback, useSyncExternalStore } from "react";
import { TAMANOS_VEHICULO, type TamanoVehiculo } from "@/types";

const STORAGE_KEY = "zplash_tamano_vehiculo";
const EVENT = "zplash-tamano-vehiculo-cambio";

// A diferencia de useCarrito (que cachea el array leído para no romper la
// referencia estable que useSyncExternalStore necesita), acá no hace falta:
// getSnapshot devuelve un string primitivo, y useSyncExternalStore compara
// snapshots con Object.is, que ya funciona bien por valor para primitivos.
function getSnapshot(): TamanoVehiculo | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return (TAMANOS_VEHICULO as readonly string[]).includes(raw || "") ? (raw as TamanoVehiculo) : null;
}

function getServerSnapshot(): TamanoVehiculo | null {
  return null;
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Tamaño de vehículo elegido por el cliente para ver precios de servicios
 * con precio diferenciado por tamaño (ver DetailingTab) — persiste en
 * localStorage para no volver a preguntarlo en cada visita, mismo patrón que
 * useCarrito. */
export function useTamanoVehiculo() {
  const tamano = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const elegir = useCallback((t: TamanoVehiculo) => {
    window.localStorage.setItem(STORAGE_KEY, t);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const limpiar = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { tamano, elegir, limpiar };
}
