"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneSesionValida } from "@/lib/session";
import type { AuditoriaEntrada } from "@/types";

export async function insertAuditoria(entradas: AuditoriaEntrada[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.insertAuditoria(entradas);
}
