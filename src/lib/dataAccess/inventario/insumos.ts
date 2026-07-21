import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { categoriasInsumo, insumos } from "@/db/schema";
import type { CategoriaInsumo, Insumo } from "@/types";
import { upsertRows } from "../shared";

type CategoriaInsumoRow = typeof categoriasInsumo.$inferSelect;
type InsumoRow = typeof insumos.$inferSelect;

function categoriaInsumoToRow(c: CategoriaInsumo): typeof categoriasInsumo.$inferInsert {
  return { id: c.id, nombre: c.nombre, activa: c.activa };
}

export function categoriaInsumoFromRow(r: CategoriaInsumoRow): CategoriaInsumo {
  return { id: r.id, nombre: r.nombre, activa: r.activa };
}

export async function upsertCategoriasInsumo(rows: CategoriaInsumo[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(categoriasInsumo, categoriasInsumo.id, rows.map(categoriaInsumoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando categorías de insumo", error);
    return false;
  }
}

export async function deleteCategoriasInsumo(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    const enUso = await getDb().select({ id: insumos.id }).from(insumos).where(inArray(insumos.categoriaId, ids)).limit(1);
    if (enUso.length) return false;
    await getDb().delete(categoriasInsumo).where(inArray(categoriasInsumo.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando categorías de insumo", error);
    return false;
  }
}

export function insumoToRow(i: Insumo): typeof insumos.$inferInsert {
  return {
    id: i.id,
    nombre: i.nombre,
    categoriaId: i.categoriaId || null,
    valorCompra: i.valorCompra || 0,
    stock: i.stock || 0,
    stockMin: i.stockMin || 0,
    stockMax: i.stockMax || 0,
    proveedorId: i.proveedorId || null,
    activo: i.activo,
    creadoEn: i.creadoEn,
    creadoPor: i.creadoPor || null,
  };
}

export function insumoFromRow(r: InsumoRow): Insumo {
  return {
    id: r.id,
    nombre: r.nombre,
    categoriaId: r.categoriaId || undefined,
    valorCompra: r.valorCompra || 0,
    stock: r.stock || 0,
    stockMin: r.stockMin || 0,
    stockMax: r.stockMax || 0,
    proveedorId: r.proveedorId || undefined,
    activo: r.activo,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function upsertInsumos(rows: Insumo[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(insumos, insumos.id, rows.map(insumoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando insumos", error);
    return false;
  }
}

export async function deleteInsumos(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(insumos).where(inArray(insumos.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando insumos", error);
    return false;
  }
}
