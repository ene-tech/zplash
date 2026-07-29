import { deleteBloqueosAgenda, deleteCitas, deleteHorariosAgenda, upsertBloqueosAgenda, upsertCitas, upsertHorariosAgenda } from "@/lib/serverActions";
import type { AuditoriaEntrada, BloqueoAgenda, Cita, HorarioAgenda } from "@/types";
import { auditEntries, diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitHorariosAgenda(previous: HorarioAgenda[], siguientes: HorarioAgenda[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertHorariosAgenda(cambiados));
  if (eliminados.length) ops.push(deleteHorariosAgenda(eliminados));
  return { ops, auditoria: [] };
}

export function commitBloqueosAgenda(previous: BloqueoAgenda[], siguientes: BloqueoAgenda[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertBloqueosAgenda(cambiados));
  if (eliminados.length) ops.push(deleteBloqueosAgenda(eliminados));
  return { ops, auditoria: [] };
}

// A diferencia del resto de entidades, citas se resuelve y se espera acá
// mismo, en vez de sumarse al arreglo `ops` compartido de commit(): commit()
// debe awaitear el resultado ANTES de procesar patch.ventas, porque
// ventas.citaId tiene FK a citas.id y ambas suelen llegar juntas en el mismo
// commit (ver registrar() en ServiciosAdicionalesView) — si corrieran en
// paralelo vía Promise.all, el insert de ventas podía llegar a la base antes
// que el de citas y violar la FK.
export async function commitCitas(
  previous: Cita[],
  siguientes: Cita[] | undefined,
  usuario: string | null
): Promise<{ ok: boolean; auditoria: AuditoriaEntrada[] }> {
  if (!siguientes) return { ok: true, auditoria: [] };
  try {
    const { cambiados, eliminados } = diffPorId(previous, siguientes);
    const resultados = await Promise.all([
      cambiados.length ? upsertCitas(cambiados) : true,
      eliminados.length ? deleteCitas(eliminados) : true,
    ]);
    return { ok: resultados.every(Boolean), auditoria: auditEntries("citas", previous, cambiados, eliminados, usuario) };
  } catch (err) {
    // Server Action inalcanzable (p. ej. operador sin conexión): tratamos
    // esto igual que un guardado fallido en vez de dejar que la promesa
    // rechazada se propague sin manejo.
    console.error("No se pudo guardar (citas): posible falla de red", err);
    return { ok: false, auditoria: [] };
  }
}
