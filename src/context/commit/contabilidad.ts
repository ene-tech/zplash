import {
  deleteCartolaMovimientos,
  deleteMovimientosContables,
  upsertCartolaMovimientos,
  upsertCategoriasGasto,
  upsertCategoriasIngreso,
  upsertMovimientosContables,
  upsertReglasConciliacion,
} from "@/lib/serverActions";
import type { CartolaMovimiento, CategoriaGasto, CategoriaIngreso, MovimientoContable, ReglaConciliacion } from "@/types";
import { auditEntries, diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitMovimientosContables(
  previous: MovimientoContable[],
  siguientes: MovimientoContable[] | undefined,
  usuario: string | null
): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertMovimientosContables(cambiados));
  if (eliminados.length) ops.push(deleteMovimientosContables(eliminados));
  return { ops, auditoria: auditEntries("movimientos_contables", previous, cambiados, eliminados, usuario) };
}

export function commitCategoriasGasto(previous: CategoriaGasto[], siguientes: CategoriaGasto[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados } = diffPorId(previous, siguientes);
  return { ops: cambiados.length ? [upsertCategoriasGasto(cambiados)] : [], auditoria: [] };
}

export function commitCategoriasIngreso(previous: CategoriaIngreso[], siguientes: CategoriaIngreso[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados } = diffPorId(previous, siguientes);
  return { ops: cambiados.length ? [upsertCategoriasIngreso(cambiados)] : [], auditoria: [] };
}

export function commitCartolaMovimientos(previous: CartolaMovimiento[], siguientes: CartolaMovimiento[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertCartolaMovimientos(cambiados));
  if (eliminados.length) ops.push(deleteCartolaMovimientos(eliminados));
  return { ops, auditoria: [] };
}

export function commitReglasConciliacion(previous: ReglaConciliacion[], siguientes: ReglaConciliacion[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados } = diffPorId(previous, siguientes);
  return { ops: cambiados.length ? [upsertReglasConciliacion(cambiados)] : [], auditoria: [] };
}
