import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { cartolaMovimientos, categoriasGasto, categoriasIngreso, movimientosContables, reglasConciliacion } from "@/db/schema";
import type { CartolaMovimiento, CategoriaGasto, CategoriaIngreso, MovimientoContable, ReglaConciliacion } from "@/types";
import { upsertRows } from "./shared";

type MovimientoRow = typeof movimientosContables.$inferSelect;
type CartolaMovimientoRow = typeof cartolaMovimientos.$inferSelect;
type ReglaConciliacionRow = typeof reglasConciliacion.$inferSelect;
type CategoriaGastoRow = typeof categoriasGasto.$inferSelect;
type CategoriaIngresoRow = typeof categoriasIngreso.$inferSelect;

export function movimientoToRow(m: MovimientoContable): typeof movimientosContables.$inferInsert {
  return {
    id: m.id,
    tipo: m.tipo,
    fecha: m.fecha,
    descripcion: m.descripcion,
    categoria: m.categoria || null,
    contraparte: m.contraparte || null,
    rutProveedor: m.rutProveedor || null,
    numeroFactura: m.numeroFactura || null,
    tipoDocumento: m.tipoDocumento || null,
    documentoUrl: m.documentoUrl || null,
    documentoNombre: m.documentoNombre || null,
    monto: m.monto || 0,
    estado: m.estado,
    metodoPago: m.metodoPago || null,
    notas: m.notas || null,
    creadoEn: m.creadoEn,
    creadoPor: m.creadoPor || null,
    fechaPago: m.fechaPago || null,
    ventaId: m.ventaId || null,
  };
}

export function movimientoFromRow(r: MovimientoRow): MovimientoContable {
  return {
    id: r.id,
    tipo: r.tipo as MovimientoContable["tipo"],
    fecha: r.fecha,
    descripcion: r.descripcion,
    categoria: r.categoria || undefined,
    contraparte: r.contraparte || undefined,
    rutProveedor: r.rutProveedor || undefined,
    numeroFactura: r.numeroFactura || undefined,
    tipoDocumento: (r.tipoDocumento as MovimientoContable["tipoDocumento"]) || undefined,
    documentoUrl: r.documentoUrl || undefined,
    documentoNombre: r.documentoNombre || undefined,
    monto: r.monto || 0,
    estado: (r.estado as MovimientoContable["estado"]) || "pendiente",
    metodoPago: (r.metodoPago as MovimientoContable["metodoPago"]) || undefined,
    notas: r.notas || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
    fechaPago: r.fechaPago || undefined,
    ventaId: r.ventaId || undefined,
  };
}

export async function upsertMovimientosContables(rows: MovimientoContable[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(movimientosContables, movimientosContables.id, rows.map(movimientoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando movimientos contables", error);
    return false;
  }
}

export async function deleteMovimientosContables(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(movimientosContables).where(inArray(movimientosContables.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando movimientos contables", error);
    return false;
  }
}

function cartolaMovimientoToRow(m: CartolaMovimiento): typeof cartolaMovimientos.$inferInsert {
  return {
    id: m.id,
    cuenta: m.cuenta || "santander_empresa",
    fecha: m.fecha,
    glosa: m.glosa,
    cargo: m.cargo || 0,
    abono: m.abono || 0,
    saldo: m.saldo ?? null,
    numeroDocumento: m.numeroDocumento || null,
    sucursal: m.sucursal || null,
    categoria: m.categoria || null,
    estado: m.estado,
    movimientoContableId: m.movimientoContableId || null,
    notas: m.notas || null,
    creadoEn: m.creadoEn,
    creadoPor: m.creadoPor || null,
  };
}

export function cartolaMovimientoFromRow(r: CartolaMovimientoRow): CartolaMovimiento {
  return {
    id: r.id,
    cuenta: r.cuenta,
    fecha: r.fecha,
    glosa: r.glosa,
    cargo: r.cargo || 0,
    abono: r.abono || 0,
    saldo: r.saldo ?? undefined,
    numeroDocumento: r.numeroDocumento || undefined,
    sucursal: r.sucursal || undefined,
    categoria: r.categoria || undefined,
    estado: (r.estado as CartolaMovimiento["estado"]) || "pendiente",
    movimientoContableId: r.movimientoContableId || undefined,
    notas: r.notas || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function upsertCartolaMovimientos(rows: CartolaMovimiento[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(cartolaMovimientos, cartolaMovimientos.id, rows.map(cartolaMovimientoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando movimientos de cartola", error);
    return false;
  }
}

export async function deleteCartolaMovimientos(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(cartolaMovimientos).where(inArray(cartolaMovimientos.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando movimientos de cartola", error);
    return false;
  }
}

function reglaConciliacionToRow(r: ReglaConciliacion): typeof reglasConciliacion.$inferInsert {
  return { id: r.id, categoria: r.categoria, creadoEn: r.creadoEn };
}

export function reglaConciliacionFromRow(r: ReglaConciliacionRow): ReglaConciliacion {
  return { id: r.id, categoria: r.categoria, creadoEn: r.creadoEn };
}

export async function upsertReglasConciliacion(rows: ReglaConciliacion[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(reglasConciliacion, reglasConciliacion.id, rows.map(reglaConciliacionToRow));
    return true;
  } catch (error) {
    console.error("Error guardando reglas de conciliación", error);
    return false;
  }
}

function categoriaGastoToRow(c: CategoriaGasto): typeof categoriasGasto.$inferInsert {
  return { id: c.id, nombre: c.nombre, grupo: c.grupo, activa: c.activa };
}

export function categoriaGastoFromRow(r: CategoriaGastoRow): CategoriaGasto {
  return { id: r.id, nombre: r.nombre, grupo: r.grupo, activa: r.activa };
}

export async function upsertCategoriasGasto(rows: CategoriaGasto[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(categoriasGasto, categoriasGasto.id, rows.map(categoriaGastoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando categorías de gasto", error);
    return false;
  }
}

function categoriaIngresoToRow(c: CategoriaIngreso): typeof categoriasIngreso.$inferInsert {
  return { id: c.id, nombre: c.nombre, activa: c.activa };
}

export function categoriaIngresoFromRow(r: CategoriaIngresoRow): CategoriaIngreso {
  return { id: r.id, nombre: r.nombre, activa: r.activa };
}

export async function upsertCategoriasIngreso(rows: CategoriaIngreso[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(categoriasIngreso, categoriasIngreso.id, rows.map(categoriaIngresoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando categorías de ingreso", error);
    return false;
  }
}
