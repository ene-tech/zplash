import "server-only";

import { inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { empresas } from "@/db/schema";
import type { Empresa } from "@/types";
import { upsertRows } from "./shared";

type EmpresaRow = typeof empresas.$inferSelect;

export function empresaToRow(e: Empresa): typeof empresas.$inferInsert {
  return {
    id: e.id,
    razonSocial: e.razonSocial,
    rut: e.rut,
    giro: e.giro || null,
    direccion: e.direccion || null,
    telefono: e.telefono || null,
    contactoClienteId: e.contactoClienteId || null,
    contactoNombre: e.contactoNombre || null,
    creadoEn: e.creadoEn,
    creadoPor: e.creadoPor || null,
  };
}

export function empresaFromRow(r: EmpresaRow): Empresa {
  return {
    id: r.id,
    razonSocial: r.razonSocial,
    rut: r.rut,
    giro: r.giro || undefined,
    direccion: r.direccion || undefined,
    telefono: r.telefono || undefined,
    contactoClienteId: r.contactoClienteId || undefined,
    contactoNombre: r.contactoNombre || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

/** true si TODAS las filas son altas: ni el id ni el RUT existen ya. Lo usa
 * el gate del POS, que puede crear una empresa para facturar en el mesón
 * pero no editar las que ya están registradas. */
export async function sonEmpresasNuevas(rows: Empresa[]): Promise<boolean> {
  if (!rows.length) return true;
  const ids = rows.map((r) => r.id).filter(Boolean);
  const ruts = rows.map((r) => r.rut).filter(Boolean);
  if (!ids.length || !ruts.length) return false;
  const db = getDb();
  const existentes = await db
    .select({ id: empresas.id })
    .from(empresas)
    .where(or(inArray(empresas.id, ids), inArray(empresas.rut, ruts)));
  return existentes.length === 0;
}

export async function upsertEmpresas(rows: Empresa[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(empresas, empresas.id, rows.map(empresaToRow));
    return true;
  } catch (error) {
    console.error("Error guardando empresas", error);
    return false;
  }
}

export async function deleteEmpresas(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(empresas).where(inArray(empresas.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando empresas", error);
    return false;
  }
}
