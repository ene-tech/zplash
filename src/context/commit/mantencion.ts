import {
  deleteAlertasMantencion,
  deleteMaquinarias,
  deletePlanesMantencion,
  deleteRegistrosMantencion,
  upsertAlertasMantencion,
  upsertMaquinarias,
  upsertPlanesMantencion,
  upsertRegistrosMantencion,
} from "@/lib/serverActions";
import type { AlertaMantencion, Maquinaria, PlanMantencion, RegistroMantencion } from "@/types";
import { diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitMaquinarias(previous: Maquinaria[], siguientes: Maquinaria[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertMaquinarias(cambiados));
  if (eliminados.length) ops.push(deleteMaquinarias(eliminados));
  return { ops, auditoria: [] };
}

export function commitPlanesMantencion(previous: PlanMantencion[], siguientes: PlanMantencion[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertPlanesMantencion(cambiados));
  if (eliminados.length) ops.push(deletePlanesMantencion(eliminados));
  return { ops, auditoria: [] };
}

export function commitRegistrosMantencion(previous: RegistroMantencion[], siguientes: RegistroMantencion[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertRegistrosMantencion(cambiados));
  if (eliminados.length) ops.push(deleteRegistrosMantencion(eliminados));
  return { ops, auditoria: [] };
}

export function commitAlertasMantencion(previous: AlertaMantencion[], siguientes: AlertaMantencion[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertAlertasMantencion(cambiados));
  if (eliminados.length) ops.push(deleteAlertasMantencion(eliminados));
  return { ops, auditoria: [] };
}
