"use server";

import * as dataAccess from "@/lib/dataAccess";
import { puedeBorrarCategoriaInventario } from "@/lib/helpers";
import { sesionActual, tieneModulo } from "@/lib/session";
import type { CategoriaProducto, Producto } from "@/types";

export async function upsertProductos(rows: Producto[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.upsertProductos(rows);
}

export async function deleteProductos(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.deleteProductos(ids);
}

export async function upsertCategoriasProducto(rows: CategoriaProducto[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.upsertCategoriasProducto(rows);
}

// Borrar una categoría (a diferencia de agregarla o desactivarla) queda
// reservado a "Gerencia" (ver puedeBorrarCategoriaInventario en @/lib/helpers
// y el botón "Borrar" en CategoriasProductoTab, que ya lo oculta al resto de
// los perfiles) — este es el único lugar que de verdad puede impedirlo, ya
// que todo Server Action queda invocable por POST directo.
export async function deleteCategoriasProducto(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  const sesion = await sesionActual();
  if (!sesion || !puedeBorrarCategoriaInventario(sesion.nombre)) return false;
  return dataAccess.deleteCategoriasProducto(ids);
}
