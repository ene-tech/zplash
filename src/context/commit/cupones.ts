import { deleteCupones, upsertCupones } from "@/lib/serverActions";
import type { Cupon } from "@/types";
import { auditEntries, diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitCupones(previous: Cupon[], siguientes: Cupon[] | undefined, usuario: string | null): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertCupones(cambiados));
  if (eliminados.length) ops.push(deleteCupones(eliminados));
  return { ops, auditoria: auditEntries("cupones", previous, cambiados, eliminados, usuario) };
}
