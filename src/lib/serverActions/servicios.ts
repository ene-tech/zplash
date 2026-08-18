"use server";

import { revalidateTag } from "next/cache";
import * as dataAccess from "@/lib/dataAccess";
import { INVALIDAR_YA, TAG_CONTENIDO_PUBLICO } from "@/lib/preciosPublicos";
import { tieneModulo } from "@/lib/session";
import type { Servicio } from "@/types";

// El catálogo de servicios lo tocan dos pestañas con audiencias distintas:
// Agenda (duración/activo, para agendamiento) y Web Settings (nombre,
// categoría, banner — contenido de venta web, ver WebSettingsTab).
export async function upsertServicios(rows: Servicio[]): Promise<boolean> {
  if (!(await tieneModulo("agenda")) && !(await tieneModulo("web_settings"))) return false;
  const ok = await dataAccess.upsertServicios(rows);
  // Nombre, categoría y el flag `activo` son justo lo que la landing lista:
  // sin invalidar, un servicio dado de baja seguiría comprable en la web.
  if (ok) revalidateTag(TAG_CONTENIDO_PUBLICO, INVALIDAR_YA);
  return ok;
}

export async function deleteServicios(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  const ok = await dataAccess.deleteServicios(ids);
  if (ok) revalidateTag(TAG_CONTENIDO_PUBLICO, INVALIDAR_YA);
  return ok;
}
