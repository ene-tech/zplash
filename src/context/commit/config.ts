import { upsertConfig } from "@/lib/serverActions";
import type { ConfigGlobal } from "@/types";
import { SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitConfig(siguiente: ConfigGlobal | undefined): CommitResult {
  if (!siguiente) return SIN_CAMBIOS;
  return { ops: [upsertConfig(siguiente)], auditoria: [] };
}
