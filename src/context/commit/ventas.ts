import { deleteVentas, insertVentas, upsertVentas } from "@/lib/serverActions";
import { movimientoContableDesdeVenta } from "@/lib/helpers";
import type { AppData, Venta } from "@/types";
import { auditEntries, diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

// Cada Venta nueva o editada genera (o actualiza) su propio movimiento
// contable de ingreso automáticamente, para que el EERR y Contabilidad →
// Ingresos no dependan de que alguien la vuelva a tipear a mano (ver
// movimientoContableDesdeVenta en @/lib/helpers). commit() debe llamar a
// esto antes de construir `next`, para que quede reflejado en el mismo
// commit tanto en el estado local como en lo que se guarda.
export function derivarMovimientosDesdeVentas(previous: AppData, patch: Partial<AppData>): Partial<AppData> {
  if (!patch.ventas) return patch;
  const { cambiados: ventasCambiadas } = diffPorId<Venta>(previous.ventas, patch.ventas);
  if (!ventasCambiadas.length) return patch;
  const derivados = ventasCambiadas.map(movimientoContableDesdeVenta);
  const baseMovimientos = patch.movimientosContables || previous.movimientosContables;
  const porId = new Map(baseMovimientos.map((m) => [m.id, m]));
  // null = venta en $0 (cupón de 100%), no genera movimiento (ver
  // movimientoContableDesdeVenta): no hay nada que registrar en Contabilidad.
  for (const d of derivados) if (d) porId.set(d.id, d);
  return { ...patch, movimientosContables: Array.from(porId.values()) };
}

export function commitVentas(previous: Venta[], siguientes: Venta[] | undefined, usuario: string | null): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const prevIds = new Set(previous.map((v) => v.id));
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const nuevas = cambiados.filter((v) => !prevIds.has(v.id));
  const editadas = cambiados.filter((v) => prevIds.has(v.id));
  const ops: Promise<boolean>[] = [];
  if (nuevas.length) ops.push(insertVentas(nuevas));
  if (editadas.length) ops.push(upsertVentas(editadas));
  if (eliminados.length) ops.push(deleteVentas(eliminados));
  return { ops, auditoria: auditEntries("ventas", previous, cambiados, eliminados, usuario) };
}
