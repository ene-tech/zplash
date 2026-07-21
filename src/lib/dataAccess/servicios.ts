import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { servicios } from "@/db/schema";
import type { Servicio } from "@/types";
import { upsertRows } from "./shared";

type ServicioRow = typeof servicios.$inferSelect;

function servicioToRow(s: Servicio): typeof servicios.$inferInsert {
  return { id: s.id, nombre: s.nombre, categoria: s.categoria || null, duracionMinutos: s.duracionMinutos, activo: s.activo };
}

export function servicioFromRow(r: ServicioRow): Servicio {
  return { id: r.id, nombre: r.nombre, categoria: r.categoria || undefined, duracionMinutos: r.duracionMinutos, activo: r.activo };
}

export async function upsertServicios(rows: Servicio[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(servicios, servicios.id, rows.map(servicioToRow));
    return true;
  } catch (error) {
    console.error("Error guardando servicios", error);
    return false;
  }
}

export async function deleteServicios(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(servicios).where(inArray(servicios.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando servicios", error);
    return false;
  }
}
