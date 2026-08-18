import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { proveedores } from "@/db/schema";
import type { Proveedor } from "@/types";
import { upsertRows } from "../shared";

type ProveedorRow = typeof proveedores.$inferSelect;

export function proveedorToRow(p: Proveedor): typeof proveedores.$inferInsert {
  return {
    id: p.id,
    nombre: p.nombre,
    rut: p.rut || null,
    telefono: p.telefono || null,
    email: p.email || null,
    direccion: p.direccion || null,
    contacto: p.contacto || null,
    emailVendedor: p.emailVendedor || null,
    telefonoVendedor: p.telefonoVendedor || null,
    emailComprobantes: p.emailComprobantes || null,
    banco: p.banco || null,
    cuentaCorriente: p.cuentaCorriente || null,
    categoriaGasto: p.categoriaGasto || null,
    creadoEn: p.creadoEn,
    creadoPor: p.creadoPor || null,
  };
}

export function proveedorFromRow(r: ProveedorRow): Proveedor {
  return {
    id: r.id,
    nombre: r.nombre,
    rut: r.rut || undefined,
    telefono: r.telefono || undefined,
    email: r.email || undefined,
    direccion: r.direccion || undefined,
    contacto: r.contacto || undefined,
    emailVendedor: r.emailVendedor || undefined,
    telefonoVendedor: r.telefonoVendedor || undefined,
    emailComprobantes: r.emailComprobantes || undefined,
    banco: r.banco || undefined,
    cuentaCorriente: r.cuentaCorriente || undefined,
    categoriaGasto: r.categoriaGasto || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function upsertProveedores(rows: Proveedor[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(proveedores, proveedores.id, rows.map(proveedorToRow));
    return true;
  } catch (error) {
    console.error("Error guardando proveedores", error);
    return false;
  }
}

export async function deleteProveedores(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(proveedores).where(inArray(proveedores.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando proveedores", error);
    return false;
  }
}
