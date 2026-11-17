"use client";

import { useSyncExternalStore } from "react";
import { enAppNativa } from "@/lib/appNativa";

const sinCambios = () => () => {};

/** Muestra su contenido solo en el navegador, no dentro de la app nativa
 * (ej. "Volver al inicio", que en la app sacaba al cliente a la landing). */
export function SoloWeb({ children }: { children: React.ReactNode }) {
  const nativa = useSyncExternalStore(sinCambios, enAppNativa, () => false);
  return nativa ? null : <>{children}</>;
}
