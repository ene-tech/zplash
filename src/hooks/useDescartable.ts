"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "zplash:descartado";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

function getServerSnapshot() {
  return false;
}

/** Aviso que el cliente puede cerrar y no vuelve a aparecer. Mismo patrón
 * useSyncExternalStore que useTamanoVehiculo: evita el flash de hidratación de
 * leer storage en un useEffect + setState. El evento es único y cada instancia
 * re-lee su clave.
 *
 * `porSesion` elige sessionStorage en vez de localStorage: para siempre (el
 * banner de bienvenida de la landing) vs. solo hasta que cierre el navegador
 * (el aviso de promoción, que tiene que volver a aparecer al próximo ingreso
 * a la cuenta). */
export function useDescartable(clave: string, porSesion = false) {
  const getSnapshot = useCallback(
    () => (porSesion ? sessionStorage : localStorage).getItem(clave) === "1",
    [clave, porSesion]
  );
  const descartado = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const descartar = useCallback(() => {
    (porSesion ? sessionStorage : localStorage).setItem(clave, "1");
    window.dispatchEvent(new Event(EVENT));
  }, [clave, porSesion]);

  return [descartado, descartar] as const;
}
