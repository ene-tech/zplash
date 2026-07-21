"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneSesionValida } from "@/lib/session";
import type { Empresa } from "@/types";

export async function upsertEmpresas(rows: Empresa[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertEmpresas(rows);
}

export async function deleteEmpresas(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteEmpresas(ids);
}
