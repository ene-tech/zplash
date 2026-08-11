import "server-only";

import { precios, preciosTamano } from "@/db/schema";
import type { Precios, PreciosTamano } from "@/types";
import { upsertRows } from "./shared";

type PrecioRow = typeof precios.$inferSelect;
type PrecioTamanoRow = typeof preciosTamano.$inferSelect;

export function preciosFromRows(rows: PrecioRow[]): Precios {
  const result: Precios = {};
  for (const r of rows) {
    result[r.plan] = { normal: r.normal || 0, promo: r.promo || 0 };
  }
  return result;
}

export async function upsertPrecios(precios_: Precios): Promise<boolean> {
  const rows = Object.entries(precios_).map(([plan, v]) => ({ plan, normal: v.normal, promo: v.promo }));
  if (!rows.length) return true;
  try {
    await upsertRows(precios, precios.plan, rows);
    return true;
  } catch (error) {
    console.error("Error guardando precios", error);
    return false;
  }
}

export function preciosTamanoFromRows(rows: PrecioTamanoRow[]): PreciosTamano {
  const result: PreciosTamano = {};
  for (const r of rows) {
    result[r.servicioId] = { s: r.s || 0, m: r.m || 0, l: r.l || 0, xl: r.xl || 0 };
  }
  return result;
}

export async function upsertPreciosTamano(precios_: PreciosTamano): Promise<boolean> {
  const rows = Object.entries(precios_).map(([servicioId, v]) => ({ servicioId, s: v.s, m: v.m, l: v.l, xl: v.xl }));
  if (!rows.length) return true;
  try {
    await upsertRows(preciosTamano, preciosTamano.servicioId, rows);
    return true;
  } catch (error) {
    console.error("Error guardando precios por tamaño", error);
    return false;
  }
}
