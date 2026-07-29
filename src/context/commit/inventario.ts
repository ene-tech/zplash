import {
  deleteCategoriasInsumo,
  deleteCategoriasProducto,
  deleteDestinosInventario,
  deleteInsumos,
  deleteMovimientosInventario,
  deleteProductos,
  deleteProveedores,
  upsertCategoriasInsumo,
  upsertCategoriasProducto,
  upsertDestinosInventario,
  upsertInsumos,
  upsertMovimientosInventario,
  upsertProductos,
  upsertProveedores,
} from "@/lib/serverActions";
import type { CategoriaInsumo, CategoriaProducto, DestinoInventario, Insumo, MovimientoInventario, Producto, Proveedor } from "@/types";
import { diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitProveedores(previous: Proveedor[], siguientes: Proveedor[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertProveedores(cambiados));
  if (eliminados.length) ops.push(deleteProveedores(eliminados));
  return { ops, auditoria: [] };
}

export function commitProductos(previous: Producto[], siguientes: Producto[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertProductos(cambiados));
  if (eliminados.length) ops.push(deleteProductos(eliminados));
  return { ops, auditoria: [] };
}

export function commitCategoriasProducto(previous: CategoriaProducto[], siguientes: CategoriaProducto[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertCategoriasProducto(cambiados));
  if (eliminados.length) ops.push(deleteCategoriasProducto(eliminados));
  return { ops, auditoria: [] };
}

export function commitInsumos(previous: Insumo[], siguientes: Insumo[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertInsumos(cambiados));
  if (eliminados.length) ops.push(deleteInsumos(eliminados));
  return { ops, auditoria: [] };
}

export function commitCategoriasInsumo(previous: CategoriaInsumo[], siguientes: CategoriaInsumo[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertCategoriasInsumo(cambiados));
  if (eliminados.length) ops.push(deleteCategoriasInsumo(eliminados));
  return { ops, auditoria: [] };
}

export function commitDestinosInventario(previous: DestinoInventario[], siguientes: DestinoInventario[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertDestinosInventario(cambiados));
  if (eliminados.length) ops.push(deleteDestinosInventario(eliminados));
  return { ops, auditoria: [] };
}

export function commitMovimientosInventario(previous: MovimientoInventario[], siguientes: MovimientoInventario[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertMovimientosInventario(cambiados));
  if (eliminados.length) ops.push(deleteMovimientosInventario(eliminados));
  return { ops, auditoria: [] };
}
