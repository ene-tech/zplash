"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { PerfilPublico } from "@/types";

// Módulo "permisos" en vez de una simple sesión: es el mismo requisito que
// ya aplica la UI (ver puedeAsignarPermisos en PerfilesTab.tsx) para
// modificar nombre/módulos de un perfil.
export async function upsertPerfiles(rows: PerfilPublico[]): Promise<boolean> {
  if (!(await tieneModulo("permisos"))) return false;
  return dataAccess.upsertPerfiles(rows);
}

export async function deletePerfiles(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("permisos"))) return false;
  return dataAccess.deletePerfiles(ids);
}
