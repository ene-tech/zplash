import type { DatosFabricacion } from "@/types";

export interface FabricacionTabProps {
  datos: DatosFabricacion;
  recargar: () => Promise<void>;
}

/** Acepta coma decimal ("37,5" o "1.250,5"), que es como se escribe acá,
 * miles con punto ("1.000") y también punto decimal ("37.5") si no hay coma. */
export function parseDecimal(s: string): number {
  return leerDecimal(s) ?? 0;
}

/** Igual que parseDecimal, pero undefined si el texto no es un número ("", "abc", "5 L", "1.2.3"). */
function leerDecimal(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const miles = /^-?\d{1,3}(\.\d{3})+$/.test(t);
  const n = Number(t.includes(",") || miles ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : undefined;
}

/** true si el texto es un número de verdad, no algo que parseDecimal leería como 0. */
export function esNumero(s: string): boolean {
  return leerDecimal(s) !== undefined;
}

export function fmtCantidad(n: number): string {
  return n.toLocaleString("es-CL", { maximumFractionDigits: 3 });
}

/** 120 → "120 ml", 20000 → "20 L". */
export function fmtFormato(ml: number): string {
  return ml >= 1000 ? `${fmtCantidad(ml / 1000)} L` : `${fmtCantidad(ml)} ml`;
}

/** El formato de compra se escribe en la unidad chica (ml, g) y se guarda en
 * la de la materia prima (L, kg); las unidades sueltas van tal cual. */
export function unidadFormato(unidad: string): { sufijo: string; factor: number } {
  if (unidad === "L") return { sufijo: "ml", factor: 1000 };
  if (unidad === "kg") return { sufijo: "g", factor: 1000 };
  return { sufijo: unidad, factor: 1 };
}

/** 5 L → "5.000 ml", 100 un → "100 un". */
export function fmtFormatoCompra(formato: number, unidad: string): string {
  const { sufijo, factor } = unidadFormato(unidad);
  return `${fmtCantidad(formato * factor)} ${sufijo}`;
}

/** Número a texto con coma decimal, para precargar un input. */
export const aTexto = (n: number) => String(n).replace(".", ",");
