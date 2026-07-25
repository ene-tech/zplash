"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { Empresa } from "@/types";

export async function upsertEmpresas(rows: Empresa[]): Promise<boolean> {
  if (!(await tieneModulo("empresas_facturacion"))) return false;
  return dataAccess.upsertEmpresas(rows);
}

export async function deleteEmpresas(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("empresas_facturacion"))) return false;
  return dataAccess.deleteEmpresas(ids);
}
