import "server-only";

import { precios } from "@/db/schema";
import type { Precios } from "@/types";
import { upsertRows } from "./shared";

type PrecioRow = typeof precios.$inferSelect;

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
