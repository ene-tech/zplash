"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { PlantillaCorreo } from "@/types";

export async function upsertPlantillasCorreo(rows: PlantillaCorreo[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertPlantillasCorreo(rows);
}

export async function deletePlantillasCorreo(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.deletePlantillasCorreo(ids);
}
