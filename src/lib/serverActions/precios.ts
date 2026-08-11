"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { Precios, PreciosTamano } from "@/types";

// Gateada con "config" o "web_settings": la pestaña Configuración y la
// pestaña Web Settings son las dos únicas superficies que escriben acá (esta
// última reservada a Gerencia por defecto, ver TODOS_LOS_MODULOS en helpers).
export async function upsertPrecios(precios: Precios): Promise<boolean> {
  if (!(await tieneModulo("config")) && !(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertPrecios(precios);
}

export async function upsertPreciosTamano(precios: PreciosTamano): Promise<boolean> {
  if (!(await tieneModulo("config")) && !(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertPreciosTamano(precios);
}
