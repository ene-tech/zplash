import { deleteServicios, upsertServicios } from "@/lib/serverActions";
import type { Servicio } from "@/types";
import { diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitServicios(previous: Servicio[], siguientes: Servicio[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertServicios(cambiados));
  if (eliminados.length) ops.push(deleteServicios(eliminados));
  return { ops, auditoria: [] };
}
