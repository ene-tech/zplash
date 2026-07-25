"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneSesionValida } from "@/lib/session";
import type { Cupon } from "@/types";

// No hay un módulo "cupones" en la UI; cualquier sesión válida puede
// gestionarlos. Intencional, no un descuido.
export async function upsertCupones(rows: Cupon[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertCupones(rows);
}

export async function deleteCupones(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteCupones(ids);
}
