import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { alertasMantencion, maquinarias, registrosMantencion } from "@/db/schema";
import type { AlertaMantencion, Maquinaria, RegistroMantencion } from "@/types";
import { upsertRows } from "./shared";

type MaquinariaRow = typeof maquinarias.$inferSelect;
type RegistroMantencionRow = typeof registrosMantencion.$inferSelect;
type AlertaMantencionRow = typeof alertasMantencion.$inferSelect;

export function maquinariaToRow(m: Maquinaria): typeof maquinarias.$inferInsert {
  return {
    id: m.id,
    nombre: m.nombre,
    tipo: m.tipo || null,
    activo: m.activo,
    periodicidadTipo: m.periodicidadTipo || null,
    intervaloDias: m.intervaloDias ?? null,
    intervaloLavados: m.intervaloLavados ?? null,
    creadoEn: m.creadoEn,
    creadoPor: m.creadoPor || null,
  };
}

export function maquinariaFromRow(r: MaquinariaRow): Maquinaria {
  return {
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo || undefined,
    activo: r.activo,
    periodicidadTipo: (r.periodicidadTipo as Maquinaria["periodicidadTipo"]) || undefined,
    intervaloDias: r.intervaloDias ?? undefined,
    intervaloLavados: r.intervaloLavados ?? undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function upsertMaquinarias(rows: Maquinaria[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(maquinarias, maquinarias.id, rows.map(maquinariaToRow));
    return true;
  } catch (error) {
    console.error("Error guardando maquinarias", error);
    return false;
  }
}

// registros_mantencion.maquinaria_id apunta acá con onDelete "cascade", así
// que borrar una máquina con bitácora se llevaría su historial — se rechaza
// acá, igual que deleteDestinosInventario con movimientos_inventario.
export async function deleteMaquinarias(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    const enUso = await getDb()
      .select({ id: registrosMantencion.id })
      .from(registrosMantencion)
      .where(inArray(registrosMantencion.maquinariaId, ids))
      .limit(1);
    if (enUso.length) return false;
    await getDb().delete(maquinarias).where(inArray(maquinarias.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando maquinarias", error);
    return false;
  }
}

export function registroMantencionToRow(r: RegistroMantencion): typeof registrosMantencion.$inferInsert {
  return {
    id: r.id,
    maquinariaId: r.maquinariaId,
    fecha: r.fecha,
    descripcion: r.descripcion,
    responsable: r.responsable || null,
    costo: r.costo ?? null,
    vehiculosDesdeUltima: r.vehiculosDesdeUltima,
    notas: r.notas || null,
    creadoPor: r.creadoPor || null,
  };
}

export function registroMantencionFromRow(r: RegistroMantencionRow): RegistroMantencion {
  return {
    id: r.id,
    maquinariaId: r.maquinariaId,
    fecha: r.fecha,
    descripcion: r.descripcion,
    responsable: r.responsable || undefined,
    costo: r.costo ?? undefined,
    vehiculosDesdeUltima: r.vehiculosDesdeUltima,
    notas: r.notas || undefined,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function upsertRegistrosMantencion(rows: RegistroMantencion[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(registrosMantencion, registrosMantencion.id, rows.map(registroMantencionToRow));
    return true;
  } catch (error) {
    console.error("Error guardando registros de mantención", error);
    return false;
  }
}

export async function deleteRegistrosMantencion(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(registrosMantencion).where(inArray(registrosMantencion.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando registros de mantención", error);
    return false;
  }
}

export function alertaMantencionToRow(a: AlertaMantencion): typeof alertasMantencion.$inferInsert {
  return {
    id: a.id,
    maquinariaId: a.maquinariaId,
    descripcion: a.descripcion,
    fechaObjetivo: a.fechaObjetivo,
    estado: a.estado,
    notas: a.notas || null,
    creadoEn: a.creadoEn,
    creadoPor: a.creadoPor || null,
    completadoEn: a.completadoEn || null,
    registroMantencionId: a.registroMantencionId || null,
  };
}

export function alertaMantencionFromRow(r: AlertaMantencionRow): AlertaMantencion {
  return {
    id: r.id,
    maquinariaId: r.maquinariaId,
    descripcion: r.descripcion,
    fechaObjetivo: r.fechaObjetivo,
    estado: r.estado as AlertaMantencion["estado"],
    notas: r.notas || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
    completadoEn: r.completadoEn || undefined,
    registroMantencionId: r.registroMantencionId || undefined,
  };
}

export async function upsertAlertasMantencion(rows: AlertaMantencion[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(alertasMantencion, alertasMantencion.id, rows.map(alertaMantencionToRow));
    return true;
  } catch (error) {
    console.error("Error guardando alertas de mantención", error);
    return false;
  }
}

export async function deleteAlertasMantencion(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(alertasMantencion).where(inArray(alertasMantencion.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando alertas de mantención", error);
    return false;
  }
}
