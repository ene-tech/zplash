import { deletePerfiles, upsertPerfiles } from "@/lib/serverActions";
import type { PerfilPublico } from "@/types";
import { diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

// La clave de un perfil nunca se escribe desde acá (perfilToRow no la
// incluye) — crearla o cambiarla pasa por rutas server-side dedicadas
// (/api/perfiles/crear, /api/perfiles/cambiar-clave). Perfiles queda fuera
// del alcance de la auditoría (ver TablaAuditada en @/types).
export function commitPerfiles(previous: PerfilPublico[], siguientes: PerfilPublico[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertPerfiles(cambiados));
  if (eliminados.length) ops.push(deletePerfiles(eliminados));
  return { ops, auditoria: [] };
}
