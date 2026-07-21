"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { Servicio } from "@/types";

// El catálogo de servicios lo tocan dos pestañas con audiencias distintas:
// Agenda (duración/activo, para agendamiento) y Web Settings (nombre,
// categoría, banner — contenido de venta web, ver WebSettingsTab).
export async function upsertServicios(rows: Servicio[]): Promise<boolean> {
  if (!(await tieneModulo("agenda")) && !(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertServicios(rows);
}

export async function deleteServicios(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.deleteServicios(ids);
}
