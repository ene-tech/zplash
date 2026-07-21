import "server-only";

import { getDb } from "@/db";
import { ingresos } from "@/db/schema";
import type { Ingreso } from "@/types";

type IngresoRow = typeof ingresos.$inferSelect;

export function ingresoToRow(i: Ingreso): typeof ingresos.$inferInsert {
  return {
    id: i.id,
    // "" representa "sin cliente" (lavado sin registro, canje de cupón) en
    // memoria — se normaliza a NULL real para poder agregar una FK a
    // clientes sin romper esos flujos (ver supabase/add-foreign-keys.sql).
    clienteId: i.clienteId || null,
    patente: i.patente,
    nombre: i.nombre,
    fecha: i.fecha,
    planEstadoAlIngreso: i.planEstadoAlIngreso,
    creadoPor: i.creadoPor || null,
    esGarantia: i.esGarantia || false,
    viaCupon: i.viaCupon || false,
    cuponCodigo: i.cuponCodigo || null,
    glosa: i.glosa || null,
    citaId: i.citaId || null,
  };
}

export function ingresoFromRow(r: IngresoRow): Ingreso {
  return {
    id: r.id,
    clienteId: r.clienteId || "",
    patente: r.patente,
    nombre: r.nombre,
    fecha: r.fecha,
    planEstadoAlIngreso: r.planEstadoAlIngreso as Ingreso["planEstadoAlIngreso"],
    creadoPor: r.creadoPor || undefined,
    esGarantia: r.esGarantia || undefined,
    viaCupon: r.viaCupon || undefined,
    cuponCodigo: r.cuponCodigo || undefined,
    glosa: r.glosa || undefined,
    citaId: r.citaId || undefined,
  };
}

export async function insertIngresos(rows: Ingreso[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await getDb().insert(ingresos).values(rows.map(ingresoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando ingresos", error);
    return false;
  }
}
