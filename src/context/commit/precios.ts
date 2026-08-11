import { upsertPrecios, upsertPreciosTamano } from "@/lib/serverActions";
import type { Precios, PreciosTamano } from "@/types";
import { SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitPrecios(siguientes: Precios | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  return { ops: [upsertPrecios(siguientes)], auditoria: [] };
}

export function commitPreciosTamano(siguientes: PreciosTamano | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  return { ops: [upsertPreciosTamano(siguientes)], auditoria: [] };
}
