"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneSesionValida } from "@/lib/session";
import type { CartolaMovimiento, CategoriaGasto, CategoriaIngreso, MovimientoContable, ReglaConciliacion } from "@/types";

export async function upsertMovimientosContables(rows: MovimientoContable[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertMovimientosContables(rows);
}

export async function deleteMovimientosContables(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteMovimientosContables(ids);
}

export async function upsertCategoriasGasto(rows: CategoriaGasto[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertCategoriasGasto(rows);
}

export async function upsertCategoriasIngreso(rows: CategoriaIngreso[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertCategoriasIngreso(rows);
}

export async function upsertCartolaMovimientos(rows: CartolaMovimiento[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertCartolaMovimientos(rows);
}

export async function deleteCartolaMovimientos(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteCartolaMovimientos(ids);
}

export async function upsertReglasConciliacion(rows: ReglaConciliacion[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertReglasConciliacion(rows);
}
