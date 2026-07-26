import { deleteIngresos, insertIngresos } from "@/lib/db";
import type { Ingreso } from "@/types";
import { auditEntries, diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

// El historial de ingresos es casi de solo alta: nunca se actualiza una fila
// ya guardada (a diferencia de clientes/ventas), y el único borrado permitido
// es el manual de Gerencia (ver eliminarIngreso en @/lib/actions y el botón
// "Eliminar" en IngresosTab, gateado con puedeBorrarIngreso) — deleteIngresos
// en @/lib/db vuelve a exigir ese mismo permiso del lado del servidor.
export function commitIngresos(previous: Ingreso[], siguientes: Ingreso[] | undefined, usuario: string | null): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const prevIds = new Set(previous.map((i) => i.id));
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const nuevos = cambiados.filter((i) => !prevIds.has(i.id));
  const ops: Promise<boolean>[] = [];
  if (nuevos.length) ops.push(insertIngresos(nuevos));
  if (eliminados.length) ops.push(deleteIngresos(eliminados));
  return { ops, auditoria: auditEntries("ingresos", previous, nuevos, eliminados, usuario) };
}
