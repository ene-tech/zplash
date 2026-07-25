"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { PlantillaWhatsapp } from "@/types";

export async function upsertPlantillasWhatsapp(rows: PlantillaWhatsapp[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertPlantillasWhatsapp(rows);
}

export async function deletePlantillasWhatsapp(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.deletePlantillasWhatsapp(ids);
}
