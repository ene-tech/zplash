"use client";

import { useCallback, useState } from "react";

export const TRAMO_LISTA = 100;

/** Primeras `tramo` filas de `lista`, y un `mostrarMas` para sumar otro tramo.
 * Renderizar los miles de clientes o ingresos de una vez trababa los celulares
 * del mesón; el buscador sigue filtrando sobre la lista completa. El límite
 * vuelve a un tramo cuando cambia la lista (otro filtro, otra búsqueda, un
 * commit): si no, después de varios "Mostrar más" cada búsqueda volvía a
 * dibujar todas esas filas. */
export function useListaPorTramos<T>(lista: T[], tramo = TRAMO_LISTA) {
  const [limite, setLimite] = useState(tramo);
  const [listaPrevia, setListaPrevia] = useState(lista);
  if (listaPrevia !== lista) {
    setListaPrevia(lista);
    setLimite(tramo);
  }
  const mostrarMas = useCallback(() => setLimite((l) => l + tramo), [tramo]);
  return {
    visibles: lista.length > limite ? lista.slice(0, limite) : lista,
    restantes: Math.max(0, lista.length - limite),
    mostrarMas,
  };
}
