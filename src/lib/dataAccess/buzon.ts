import "server-only";

import { asc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { reglasFiltroCorreo } from "@/db/schema";
import type { AccionFiltroCorreo, CampoFiltroCorreo, OperadorFiltroCorreo, ReglaFiltroCorreo } from "@/types";
import { upsertRows } from "./shared";

type ReglaFiltroCorreoRow = typeof reglasFiltroCorreo.$inferSelect;

function reglaToRow(r: ReglaFiltroCorreo, orden: number): typeof reglasFiltroCorreo.$inferInsert {
  return {
    id: r.id,
    nombre: r.nombre,
    activa: r.activa,
    orden,
    combinador: r.combinador,
    condiciones: r.condiciones,
    accion: r.accion,
    carpetaDestino: r.carpetaDestino || null,
    detenerEvaluacion: r.detenerEvaluacion,
  };
}

function reglaFromRow(r: ReglaFiltroCorreoRow): ReglaFiltroCorreo {
  return {
    id: r.id,
    nombre: r.nombre,
    activa: r.activa,
    combinador: r.combinador as ReglaFiltroCorreo["combinador"],
    condiciones: (r.condiciones as { campo: string; operador: string; valor: string }[]).map((c) => ({
      campo: c.campo as CampoFiltroCorreo,
      operador: c.operador as OperadorFiltroCorreo,
      valor: c.valor,
    })),
    accion: r.accion as AccionFiltroCorreo,
    carpetaDestino: r.carpetaDestino || undefined,
    detenerEvaluacion: r.detenerEvaluacion,
  };
}

// Orden de evaluación = orden de la lista que llega desde la UI (ver
// FiltrosCorreoPanel, que reordena con flechas arriba/abajo) — se guarda
// como índice en `orden` para no depender del orden natural (no garantizado)
// en que Postgres devuelve las filas.
export async function listarReglasFiltroCorreo(): Promise<ReglaFiltroCorreo[]> {
  const rows = await getDb().select().from(reglasFiltroCorreo).orderBy(asc(reglasFiltroCorreo.orden));
  return rows.map(reglaFromRow);
}

export async function upsertReglasFiltroCorreo(reglas: ReglaFiltroCorreo[]): Promise<boolean> {
  if (!reglas.length) return true;
  try {
    await upsertRows(reglasFiltroCorreo, reglasFiltroCorreo.id, reglas.map((r, i) => reglaToRow(r, i)));
    return true;
  } catch (error) {
    console.error("Error guardando reglas de filtro de correo", error);
    return false;
  }
}

export async function deleteReglasFiltroCorreo(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(reglasFiltroCorreo).where(inArray(reglasFiltroCorreo.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando reglas de filtro de correo", error);
    return false;
  }
}
