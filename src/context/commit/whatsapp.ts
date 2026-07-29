import { deletePlantillasWhatsapp, deleteReglasWhatsapp, upsertPlantillasWhatsapp, upsertReglasWhatsapp } from "@/lib/serverActions";
import type { PlantillaWhatsapp, ReglaWhatsapp } from "@/types";
import { diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitPlantillasWhatsapp(previous: PlantillaWhatsapp[], siguientes: PlantillaWhatsapp[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertPlantillasWhatsapp(cambiados));
  if (eliminados.length) ops.push(deletePlantillasWhatsapp(eliminados));
  return { ops, auditoria: [] };
}

export function commitReglasWhatsapp(previous: ReglaWhatsapp[], siguientes: ReglaWhatsapp[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertReglasWhatsapp(cambiados));
  if (eliminados.length) ops.push(deleteReglasWhatsapp(eliminados));
  return { ops, auditoria: [] };
}
