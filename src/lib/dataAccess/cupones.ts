import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { cupones } from "@/db/schema";
import type { Cupon } from "@/types";
import { upsertRows } from "./shared";

type CuponRow = typeof cupones.$inferSelect;

export function cuponToRow(c: Cupon): typeof cupones.$inferInsert {
  return {
    id: c.id,
    codigo: c.codigo,
    nombreLote: c.nombreLote,
    valor: c.valor || 0,
    numeroLote: c.numeroLote || 1,
    totalLote: c.totalLote || 1,
    fechaCaducidad: c.fechaCaducidad,
    usado: c.usado || false,
    patenteUso: c.patenteUso || null,
    fechaUso: c.fechaUso || null,
    operadorUso: c.operadorUso || null,
    creadoEn: c.creadoEn,
    creadoPor: c.creadoPor || null,
    tipo: c.tipo || "vale",
    patenteAsignada: c.patenteAsignada || null,
    esPorcentaje: c.esPorcentaje || false,
    rut: c.rut || null,
    patentesAutorizadas: c.patentesAutorizadas?.length ? c.patentesAutorizadas : null,
    email: c.email || null,
  };
}

export function cuponFromRow(r: CuponRow): Cupon {
  return {
    id: r.id,
    codigo: r.codigo,
    nombreLote: r.nombreLote,
    valor: r.valor || 0,
    numeroLote: r.numeroLote || 1,
    totalLote: r.totalLote || 1,
    fechaCaducidad: r.fechaCaducidad,
    usado: r.usado || false,
    patenteUso: r.patenteUso || undefined,
    fechaUso: r.fechaUso || undefined,
    operadorUso: r.operadorUso || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
    tipo: (r.tipo as Cupon["tipo"]) || "vale",
    patenteAsignada: r.patenteAsignada || undefined,
    esPorcentaje: r.esPorcentaje || false,
    rut: r.rut || undefined,
    patentesAutorizadas: r.patentesAutorizadas?.length ? r.patentesAutorizadas : undefined,
    email: r.email || undefined,
  };
}

export async function upsertCupones(rows: Cupon[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(cupones, cupones.id, rows.map(cuponToRow));
    return true;
  } catch (error) {
    console.error("Error guardando cupones", error);
    return false;
  }
}

export async function deleteCupones(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(cupones).where(inArray(cupones.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando cupones", error);
    return false;
  }
}
