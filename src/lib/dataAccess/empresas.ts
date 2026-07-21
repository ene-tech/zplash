import "server-only";

import { inArray } from "drizzle-orm";
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
