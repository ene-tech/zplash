import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { reglasWhatsapp } from "@/db/schema";
import type { AccionReglaWhatsapp, ReglaWhatsapp, TipoEventoReglaWhatsapp } from "@/types";
import { upsertRows } from "../shared";

type ReglaWhatsappRow = typeof reglasWhatsapp.$inferSelect;

function reglaWhatsappToRow(r: ReglaWhatsapp): typeof reglasWhatsapp.$inferInsert {
  return {
    id: r.id,
    nombre: r.nombre,
    activa: r.activa,
    tipoEvento: r.tipoEvento,
    condicionTipoVenta: r.condicionTipoVenta || null,
    condicionPlanes: r.condicionPlanes?.length ? r.condicionPlanes : null,
    condicionDiasAntesVencimiento: r.condicionDiasAntesVencimiento ?? null,
    delayDias: r.delayDias || 0,
    accion: r.accion,
    cuponEsPorcentaje: r.cuponEsPorcentaje || false,
    cuponValor: r.cuponValor ?? null,
    cuponValidezDias: r.cuponValidezDias ?? null,
    plantillaWhatsappId: r.plantillaWhatsappId,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || null,
  };
}

export function reglaWhatsappFromRow(r: ReglaWhatsappRow): ReglaWhatsapp {
  return {
    id: r.id,
    nombre: r.nombre,
    activa: r.activa,
    tipoEvento: r.tipoEvento as TipoEventoReglaWhatsapp,
    condicionTipoVenta: r.condicionTipoVenta || undefined,
    condicionPlanes: r.condicionPlanes?.length ? r.condicionPlanes : undefined,
    condicionDiasAntesVencimiento: r.condicionDiasAntesVencimiento ?? undefined,
    delayDias: r.delayDias || 0,
    accion: r.accion as AccionReglaWhatsapp,
    cuponEsPorcentaje: r.cuponEsPorcentaje || false,
    cuponValor: r.cuponValor ?? undefined,
    cuponValidezDias: r.cuponValidezDias ?? undefined,
    plantillaWhatsappId: r.plantillaWhatsappId,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function upsertReglasWhatsapp(rows: ReglaWhatsapp[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(reglasWhatsapp, reglasWhatsapp.id, rows.map(reglaWhatsappToRow));
    return true;
  } catch (error) {
    console.error("Error guardando reglas de WhatsApp", error);
    return false;
  }
}

export async function deleteReglasWhatsapp(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(reglasWhatsapp).where(inArray(reglasWhatsapp.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando reglas de WhatsApp", error);
    return false;
  }
}

export async function listarReglasWhatsappActivas(tipoEvento: TipoEventoReglaWhatsapp): Promise<ReglaWhatsapp[]> {
  const rows = await getDb()
    .select()
    .from(reglasWhatsapp)
    .where(and(eq(reglasWhatsapp.activa, true), eq(reglasWhatsapp.tipoEvento, tipoEvento)));
  return rows.map(reglaWhatsappFromRow);
}

export async function obtenerReglaWhatsapp(id: string): Promise<ReglaWhatsapp | null> {
  const [row] = await getDb().select().from(reglasWhatsapp).where(eq(reglasWhatsapp.id, id)).limit(1);
  return row ? reglaWhatsappFromRow(row) : null;
}
