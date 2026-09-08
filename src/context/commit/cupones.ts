import { deleteCupones, upsertCupones } from "@/lib/serverActions";
import type { AuditoriaEntrada, Cupon } from "@/types";
import { auditEntries, diffPorId } from "./shared";

// Async y con `ok` ya resuelto (como commitCitas, ver ./agenda) en vez del
// CommitResult de las demás tablas: ingresos.cuponCodigo tiene FK a
// cupones.codigo y la Promo 2 Lavados emite los tickets y canjea el primero
// en el MISMO commit (ver entregarPromo2Lavados en @/lib/logic), así que
// commit() tiene que esperar esta escritura antes de disparar la de ingresos.
export async function commitCupones(
  previous: Cupon[],
  siguientes: Cupon[] | undefined,
  usuario: string | null
): Promise<{ ok: boolean; auditoria: AuditoriaEntrada[] }> {
  if (!siguientes) return { ok: true, auditoria: [] };
  try {
    const { cambiados, eliminados } = diffPorId(previous, siguientes);
    const resultados = await Promise.all([
      cambiados.length ? upsertCupones(cambiados) : true,
      eliminados.length ? deleteCupones(eliminados) : true,
    ]);
    return { ok: resultados.every(Boolean), auditoria: auditEntries("cupones", previous, cambiados, eliminados, usuario) };
  } catch (err) {
    // Server Action inalcanzable (p. ej. operador sin conexión): mismo
    // tratamiento que un guardado fallido, igual que commitCitas.
    console.error("No se pudo guardar (cupones): posible falla de red", err);
    return { ok: false, auditoria: [] };
  }
}
