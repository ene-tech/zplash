import { deleteEmpresas, upsertEmpresas } from "@/lib/serverActions";
import type { Empresa } from "@/types";
import { auditEntries, diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitEmpresas(previous: Empresa[], siguientes: Empresa[] | undefined, usuario: string | null): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertEmpresas(cambiados));
  if (eliminados.length) ops.push(deleteEmpresas(eliminados));
  return { ops, auditoria: auditEntries("empresas", previous, cambiados, eliminados, usuario) };
}
