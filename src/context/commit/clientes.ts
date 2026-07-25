import { deleteClientes, upsertClientes } from "@/lib/db";
import type { AuditoriaEntrada, Cliente } from "@/types";
import { auditEntries, diffPorId } from "./shared";

// A diferencia del resto de las entidades (que se disparan todas juntas en
// el `ops` compartido de commit() y se esperan recién al final con
// Promise.all), acá hay que resolver y esperar el guardado de clientes ANTES
// de que commit() dispare ingresos/ventas: ambas tablas tienen columnas con
// FK a clientes.id, y cuando el commit da de alta un cliente nuevo (p.ej.
// "Registrar y dar ingreso" en OperadorNotFoundResult) esa fila todavía no
// existe en la base. Si el insert de ingresos/ventas corriera en paralelo
// con el upsert de clientes (dos Server Actions en conexiones separadas,
// sin ninguna transacción que las una), a veces alcanzaba a llegar a
// Postgres antes de que el alta del cliente confirmara, violando la FK — un
// "no se pudo guardar" que en realidad era una carrera, no un problema de
// conexión (mismo patrón que ya se resuelve para citas → ventas más abajo
// en AppContext.tsx, ver commitCitas).
export async function commitClientes(
  previous: Cliente[],
  siguientes: Cliente[] | undefined,
  usuario: string | null
): Promise<{ ok: boolean; auditoria: AuditoriaEntrada[] }> {
  if (!siguientes) return { ok: true, auditoria: [] };
  try {
    const { cambiados, eliminados } = diffPorId(previous, siguientes);
    const resultados = await Promise.all([
      cambiados.length ? upsertClientes(cambiados) : true,
      eliminados.length ? deleteClientes(eliminados) : true,
    ]);
    return { ok: resultados.every(Boolean), auditoria: auditEntries("clientes", previous, cambiados, eliminados, usuario) };
  } catch (err) {
    // Igual que commitCitas: si el fetch de la Server Action nunca llega al
    // servidor (offline), la promesa rechaza en vez de resolver `false`.
    console.error("No se pudo guardar (clientes): posible falla de red", err);
    return { ok: false, auditoria: [] };
  }
}
