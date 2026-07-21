import "server-only";

import { inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { destinosInventario, movimientosInventario } from "@/db/schema";
import type { DestinoInventario, MovimientoInventario } from "@/types";
import { upsertRows } from "../shared";

type DestinoInventarioRow = typeof destinosInventario.$inferSelect;
type MovimientoInventarioRow = typeof movimientosInventario.$inferSelect;

export function destinoInventarioToRow(d: DestinoInventario): typeof destinosInventario.$inferInsert {
  return { id: d.id, nombre: d.nombre, esBodega: d.esBodega, activo: d.activo };
}

export function destinoInventarioFromRow(r: DestinoInventarioRow): DestinoInventario {
  return { id: r.id, nombre: r.nombre, esBodega: r.esBodega, activo: r.activo };
}

export async function upsertDestinosInventario(rows: DestinoInventario[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(destinosInventario, destinosInventario.id, rows.map(destinoInventarioToRow));
    return true;
  } catch (error) {
    console.error("Error guardando destinos de inventario", error);
    return false;
  }
}

// A diferencia de deleteProductos, acá hay dos motivos para rechazar el
// borrado: 1) el destino "Bodega" (esBodega) es el origen implícito de todo
// Producto.stock (ver stockPorDestino en helpers.ts) — borrarlo dejaría ese
// cálculo sin dónde anclar; 2) movimientos_inventario.origen_id/destino_id
// apuntan acá con onDelete "restrict" (ver src/db/schema.ts), así que un
// destino con traspasos en su historial no se puede borrar sin perder ese
// registro. La UI (ver DestinosInventarioTab) ya avisa antes de llamar acá,
// pero esto es lo que de verdad lo impide.
export async function deleteDestinosInventario(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    const seleccionados = await getDb()
      .select({ id: destinosInventario.id, esBodega: destinosInventario.esBodega })
      .from(destinosInventario)
      .where(inArray(destinosInventario.id, ids));
    if (seleccionados.some((d) => d.esBodega)) return false;
    const enUso = await getDb()
      .select({ id: movimientosInventario.id })
      .from(movimientosInventario)
      .where(or(inArray(movimientosInventario.origenId, ids), inArray(movimientosInventario.destinoId, ids)))
      .limit(1);
    if (enUso.length) return false;
    await getDb().delete(destinosInventario).where(inArray(destinosInventario.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando destinos de inventario", error);
    return false;
  }
}

export function movimientoInventarioToRow(m: MovimientoInventario): typeof movimientosInventario.$inferInsert {
  return {
    id: m.id,
    productoId: m.productoId,
    origenId: m.origenId,
    destinoId: m.destinoId,
    cantidad: m.cantidad,
    fecha: m.fecha,
    notas: m.notas || null,
    creadoPor: m.creadoPor || null,
  };
}

export function movimientoInventarioFromRow(r: MovimientoInventarioRow): MovimientoInventario {
  return {
    id: r.id,
    productoId: r.productoId,
    origenId: r.origenId,
    destinoId: r.destinoId,
    cantidad: r.cantidad,
    fecha: r.fecha,
    notas: r.notas || undefined,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function upsertMovimientosInventario(rows: MovimientoInventario[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(movimientosInventario, movimientosInventario.id, rows.map(movimientoInventarioToRow));
    return true;
  } catch (error) {
    console.error("Error guardando movimientos de inventario", error);
    return false;
  }
}

export async function deleteMovimientosInventario(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(movimientosInventario).where(inArray(movimientosInventario.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando movimientos de inventario", error);
    return false;
  }
}
