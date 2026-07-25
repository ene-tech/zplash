import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { plantillasCorreo } from "@/db/schema";
import type { PlantillaCorreo } from "@/types";
import { upsertRows } from "./shared";

type PlantillaCorreoRow = typeof plantillasCorreo.$inferSelect;

function plantillaCorreoToRow(p: PlantillaCorreo): typeof plantillasCorreo.$inferInsert {
  return { id: p.id, nombre: p.nombre, categoria: p.categoria || null, asunto: p.asunto, cuerpo: p.cuerpo, activo: p.activo };
}

export function plantillaCorreoFromRow(r: PlantillaCorreoRow): PlantillaCorreo {
  return { id: r.id, nombre: r.nombre, categoria: r.categoria || undefined, asunto: r.asunto, cuerpo: r.cuerpo, activo: r.activo };
}

export async function upsertPlantillasCorreo(rows: PlantillaCorreo[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(plantillasCorreo, plantillasCorreo.id, rows.map(plantillaCorreoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando plantillas de correo", error);
    return false;
  }
}

export async function deletePlantillasCorreo(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(plantillasCorreo).where(inArray(plantillasCorreo.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando plantillas de correo", error);
    return false;
  }
}
