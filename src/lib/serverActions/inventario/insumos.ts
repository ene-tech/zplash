"use server";

import * as dataAccess from "@/lib/dataAccess";
import { puedeBorrarCategoriaInventario } from "@/lib/helpers";
import { sesionActual, tieneModulo } from "@/lib/session";
import type { CategoriaInsumo, Insumo } from "@/types";

export async function upsertCategoriasInsumo(rows: CategoriaInsumo[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.upsertCategoriasInsumo(rows);
}

// Mismo criterio que deleteCategoriasProducto: solo "Gerencia" puede borrar.
export async function deleteCategoriasInsumo(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  const sesion = await sesionActual();
  if (!sesion || !puedeBorrarCategoriaInventario(sesion.nombre)) return false;
  return dataAccess.deleteCategoriasInsumo(ids);
}

export async function upsertInsumos(rows: Insumo[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.upsertInsumos(rows);
}

export async function deleteInsumos(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.deleteInsumos(ids);
}
