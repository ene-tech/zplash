"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { AlertaMantencion, Maquinaria, PlanMantencion, RegistroMantencion } from "@/types";

export async function upsertMaquinarias(rows: Maquinaria[]): Promise<boolean> {
  if (!(await tieneModulo("mantencion"))) return false;
  return dataAccess.upsertMaquinarias(rows);
}

export async function deleteMaquinarias(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("mantencion"))) return false;
  return dataAccess.deleteMaquinarias(ids);
}

export async function upsertPlanesMantencion(rows: PlanMantencion[]): Promise<boolean> {
  if (!(await tieneModulo("mantencion"))) return false;
  return dataAccess.upsertPlanesMantencion(rows);
}

export async function deletePlanesMantencion(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("mantencion"))) return false;
  return dataAccess.deletePlanesMantencion(ids);
}

export async function upsertRegistrosMantencion(rows: RegistroMantencion[]): Promise<boolean> {
  if (!(await tieneModulo("mantencion"))) return false;
  return dataAccess.upsertRegistrosMantencion(rows);
}

export async function deleteRegistrosMantencion(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("mantencion"))) return false;
  return dataAccess.deleteRegistrosMantencion(ids);
}

export async function upsertAlertasMantencion(rows: AlertaMantencion[]): Promise<boolean> {
  if (!(await tieneModulo("mantencion"))) return false;
  return dataAccess.upsertAlertasMantencion(rows);
}

export async function deleteAlertasMantencion(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("mantencion"))) return false;
  return dataAccess.deleteAlertasMantencion(ids);
}
