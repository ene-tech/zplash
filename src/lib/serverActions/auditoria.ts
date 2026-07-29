"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneSesionValida } from "@/lib/session";
import type { AuditoriaEntrada } from "@/types";

// No es una acción de un tab propio sino el registro interno que hace
// AppContext de las acciones de cualquier perfil; no hay un módulo "auditoria"
// que gatear acá. Intencional, no un descuido.
export async function insertAuditoria(entradas: AuditoriaEntrada[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.insertAuditoria(entradas);
}
