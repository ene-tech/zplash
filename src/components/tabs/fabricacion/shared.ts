import type { DatosFabricacion } from "@/types";

export interface FabricacionTabProps {
  datos: DatosFabricacion;
  recargar: () => Promise<void>;
}

/** Acepta coma decimal ("37,5" o "1.250,5"), que es como se escribe acá,
 * miles con punto ("1.000") y también punto decimal ("37.5") si no hay coma. */
export function parseDecimal(s: string): number {
  const t = s.trim();
  const miles = /^\d{1,3}(\.\d{3})+$/.test(t);
  const n = Number(t.includes(",") || miles ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}

export function fmtCantidad(n: number): string {
  return n.toLocaleString("es-CL", { maximumFractionDigits: 3 });
}

export const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30";
