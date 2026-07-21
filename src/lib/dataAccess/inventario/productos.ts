import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { categoriasProducto, productos } from "@/db/schema";
import type { CategoriaProducto, Producto } from "@/types";
import { upsertRows } from "../shared";

type CategoriaProductoRow = typeof categoriasProducto.$inferSelect;
type ProductoRow = typeof productos.$inferSelect;

function categoriaProductoToRow(c: CategoriaProducto): typeof categoriasProducto.$inferInsert {
  return { id: c.id, nombre: c.nombre, activa: c.activa };
}

export function categoriaProductoFromRow(r: CategoriaProductoRow): CategoriaProducto {
  return { id: r.id, nombre: r.nombre, activa: r.activa };
}

export async function upsertCategoriasProducto(rows: CategoriaProducto[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(categoriasProducto, categoriasProducto.id, rows.map(categoriaProductoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando categorías de producto", error);
    return false;
  }
}

// A diferencia de deleteProductos, acá no basta con borrar la fila:
// productos.categoria_id apunta a esta tabla con onDelete "set null" (ver
// src/db/schema.ts), así que un borrado sin aviso dejaría productos
// existentes sin categoría en silencio. Se rechaza el borrado si todavía hay
// algún producto usando la categoría; la UI (ver CategoriasProductoTab) ya
// avisa antes de llamar acá, pero esto es lo que de verdad lo impide.
export async function deleteCategoriasProducto(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    const enUso = await getDb().select({ id: productos.id }).from(productos).where(inArray(productos.categoriaId, ids)).limit(1);
    if (enUso.length) return false;
    await getDb().delete(categoriasProducto).where(inArray(categoriasProducto.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando categorías de producto", error);
    return false;
  }
}

export function productoToRow(p: Producto): typeof productos.$inferInsert {
  return {
    id: p.id,
    codigo: p.codigo,
    sku: p.sku,
    detalle: p.detalle,
    categoriaId: p.categoriaId || null,
    valorCompra: p.valorCompra || 0,
    valorVenta: p.valorVenta || 0,
    stock: p.stock || 0,
    stockMin: p.stockMin || 0,
    stockMax: p.stockMax || 0,
    empaqueMinimo: p.empaqueMinimo || 1,
    proveedorId: p.proveedorId || null,
    activo: p.activo,
    creadoEn: p.creadoEn,
    creadoPor: p.creadoPor || null,
  };
}

export function productoFromRow(r: ProductoRow): Producto {
  return {
    id: r.id,
    codigo: r.codigo,
    sku: r.sku,
    detalle: r.detalle,
    categoriaId: r.categoriaId || undefined,
    valorCompra: r.valorCompra || 0,
    valorVenta: r.valorVenta || 0,
    stock: r.stock || 0,
    stockMin: r.stockMin || 0,
    stockMax: r.stockMax || 0,
    empaqueMinimo: r.empaqueMinimo || 1,
    proveedorId: r.proveedorId || undefined,
    activo: r.activo,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function upsertProductos(rows: Producto[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(productos, productos.id, rows.map(productoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando productos", error);
    return false;
  }
}

export async function deleteProductos(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(productos).where(inArray(productos.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando productos", error);
    return false;
  }
}
