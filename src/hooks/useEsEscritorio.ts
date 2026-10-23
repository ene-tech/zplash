"use client";

import { useSyncExternalStore } from "react";

// Mismo corte que el `md:` de Tailwind (48rem).
const CONSULTA = "(min-width: 768px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(CONSULTA);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(CONSULTA).matches;
}

function getServerSnapshot() {
  return false;
}

/** true en pantallas md o más anchas. Para montar SOLO la versión que se ve
 * (tabla o lista de tarjetas) en vez de renderizar las dos y esconder una con
 * `hidden md:block`: con miles de filas, la escondida costaba lo mismo y en
 * los celulares del mesón trababa la pantalla. */
export function useEsEscritorio() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
