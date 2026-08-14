"use server";

import * as dataAccess from "@/lib/dataAccess";
import { enviarInvitacionesMigracionWoo as enviarInvitacionesMigracionWooImpl } from "@/lib/mailing/migracionWoo";
import { tieneModulo } from "@/lib/session";
import type { HistorialReglaCorreo, PlantillaCorreo, ReglaCorreo, ResultadoEnvioMasivoCorreo } from "@/types";

export async function upsertPlantillasCorreo(rows: PlantillaCorreo[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertPlantillasCorreo(rows);
}

export async function deletePlantillasCorreo(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.deletePlantillasCorreo(ids);
}

export async function upsertReglasCorreo(rows: ReglaCorreo[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertReglasCorreo(rows);
}

export async function deleteReglasCorreo(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.deleteReglasCorreo(ids);
}

export async function listarHistorialReglasCorreo(): Promise<HistorialReglaCorreo[]> {
  if (!(await tieneModulo("web_settings"))) return [];
  return dataAccess.listarHistorialReglasCorreo();
}

// Campaña de migración WooCommerce→Oneclick (Web Settings → Reglas Correo) —
// ver comentario en @/lib/mailing/migracionWoo.
export async function enviarInvitacionesMigracionWoo(): Promise<ResultadoEnvioMasivoCorreo> {
  const vacio: ResultadoEnvioMasivoCorreo = { total: 0, enviados: 0, fallidos: 0, sinEmail: 0 };
  if (!(await tieneModulo("web_settings"))) return vacio;
  return enviarInvitacionesMigracionWooImpl();
}
