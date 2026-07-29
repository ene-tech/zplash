import { deletePlantillasCorreo, upsertPlantillasCorreo } from "@/lib/serverActions";
import type { PlantillaCorreo } from "@/types";
import { diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitPlantillasCorreo(previous: PlantillaCorreo[], siguientes: PlantillaCorreo[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertPlantillasCorreo(cambiados));
  if (eliminados.length) ops.push(deletePlantillasCorreo(eliminados));
  return { ops, auditoria: [] };
}
