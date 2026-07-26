import "server-only";

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { plantillasWhatsapp } from "@/db/schema";
import type { PlantillaWhatsapp } from "@/types";
import { upsertRows } from "../shared";

type PlantillaWhatsappRow = typeof plantillasWhatsapp.$inferSelect;

function plantillaWhatsappToRow(p: PlantillaWhatsapp): typeof plantillasWhatsapp.$inferInsert {
  return {
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria || null,
    mensaje: p.mensaje,
    activo: p.activo,
    metaNombre: p.metaNombre || null,
    metaIdioma: p.metaIdioma || null,
    metaVariables: p.metaVariables?.length ? p.metaVariables : null,
    metaAprobado: p.metaAprobado,
  };
}

export function plantillaWhatsappFromRow(r: PlantillaWhatsappRow): PlantillaWhatsapp {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria || undefined,
    mensaje: r.mensaje,
    activo: r.activo,
    metaNombre: r.metaNombre || undefined,
    metaIdioma: r.metaIdioma || undefined,
    metaVariables: r.metaVariables?.length ? r.metaVariables : undefined,
    metaAprobado: r.metaAprobado,
  };
}

export async function upsertPlantillasWhatsapp(rows: PlantillaWhatsapp[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(plantillasWhatsapp, plantillasWhatsapp.id, rows.map(plantillaWhatsappToRow));
    return true;
  } catch (error) {
    console.error("Error guardando plantillas de WhatsApp", error);
    return false;
  }
}

export async function deletePlantillasWhatsapp(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(plantillasWhatsapp).where(inArray(plantillasWhatsapp.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando plantillas de WhatsApp", error);
    return false;
  }
}

export async function obtenerPlantillaWhatsapp(id: string): Promise<PlantillaWhatsapp | null> {
  const [row] = await getDb().select().from(plantillasWhatsapp).where(eq(plantillasWhatsapp.id, id)).limit(1);
  return row ? plantillaWhatsappFromRow(row) : null;
}
