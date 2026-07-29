"use server";

import * as dataAccess from "@/lib/dataAccess";
import { puedeBorrarCategoriaInventario } from "@/lib/helpers";
import { sesionActual, tieneModulo } from "@/lib/session";
import type { DestinoInventario, MovimientoInventario } from "@/types";

export async function upsertDestinosInventario(rows: DestinoInventario[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.upsertDestinosInventario(rows);
}

// Mismo criterio que deleteCategoriasProducto: solo "Gerencia" puede borrar
// un destino (el catálogo lo puede editar/desactivar cualquiera con acceso a
// Inventario, ver DestinosInventarioTab).
export async function deleteDestinosInventario(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  const sesion = await sesionActual();
  if (!sesion || !puedeBorrarCategoriaInventario(sesion.nombre)) return false;
  return dataAccess.deleteDestinosInventario(ids);
}

export async function upsertMovimientosInventario(rows: MovimientoInventario[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.upsertMovimientosInventario(rows);
}

// Borrar un traspaso (corregir un error de carga) queda reservado a
// "Gerencia", mismo criterio que borrar una categoría: cualquiera con acceso
// a Inventario puede registrar un traspaso nuevo, pero no borrar del
// historial ya guardado (ver TraspasoModal/StockDestinosTab).
export async function deleteMovimientosInventario(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  const sesion = await sesionActual();
  if (!sesion || !puedeBorrarCategoriaInventario(sesion.nombre)) return false;
  return dataAccess.deleteMovimientosInventario(ids);
}
