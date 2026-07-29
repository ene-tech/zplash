"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { Proveedor } from "@/types";

export async function upsertProveedores(rows: Proveedor[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.upsertProveedores(rows);
}

export async function deleteProveedores(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("inventario"))) return false;
  return dataAccess.deleteProveedores(ids);
}
