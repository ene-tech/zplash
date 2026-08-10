"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  CARRITO_EVENT,
  agregarItemCarrito,
  invalidarCacheCarrito,
  leerCarrito,
  quitarItemCarrito,
  totalCarrito,
  vaciarCarrito,
  type ItemCarrito,
} from "@/lib/carrito";

function subscribe(callback: () => void) {
  const onStorage = () => {
    invalidarCacheCarrito();
    callback();
  };
  window.addEventListener(CARRITO_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CARRITO_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

// Referencia estable: si devolviéramos un array literal nuevo en cada
// llamada, useSyncExternalStore lo vería como "cambió" en cada render
// (compara por Object.is) y entraría en loop infinito de re-render.
const CARRITO_VACIO: ItemCarrito[] = [];

function getServerSnapshot(): ItemCarrito[] {
  return CARRITO_VACIO;
}

export function useCarrito() {
  const items = useSyncExternalStore(subscribe, leerCarrito, getServerSnapshot);

  const agregar = useCallback((item: ItemCarrito) => {
    agregarItemCarrito(item);
  }, []);
  const quitar = useCallback((key: string) => {
    quitarItemCarrito(key);
  }, []);
  const vaciar = useCallback(() => {
    vaciarCarrito();
  }, []);

  return { items, total: totalCarrito(items), agregar, quitar, vaciar };
}
