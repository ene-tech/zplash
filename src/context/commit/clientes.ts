import { deleteClientes, upsertClientes } from "@/lib/serverActions";
import { patchDeCliente } from "@/lib/helpers";
import type { AuditoriaEntrada, Cliente, ClientePatch } from "@/types";
import { diffPorId } from "./shared";

// Arma las entradas de auditoría a partir de los patches (no de la fila
// completa, ver patchDeCliente): `datosNuevos` queda con solo los campos que
// esta sesión realmente cambió. No se reutiliza auditEntries() de ./shared
// porque esa función asume que `previos` y `cambiados` son del mismo tipo
// completo T — acá son Cliente[] y ClientePatch[] a propósito.
function auditEntriesClientes(
  previos: Cliente[],
  patches: ClientePatch[],
  eliminados: string[],
  usuario: string | null
): AuditoriaEntrada[] {
  const prevById = new Map(previos.map((x) => [x.id, x]));
  const entradas: AuditoriaEntrada[] = patches.map((patch) => {
    const anterior = prevById.get(patch.id);
    return {
      tabla: "clientes",
      registroId: patch.id,
      accion: anterior ? "update" : "insert",
      datosAnteriores: anterior ?? null,
      datosNuevos: patch,
      usuario,
    };
  });
  for (const id of eliminados) {
    entradas.push({
      tabla: "clientes",
      registroId: id,
      accion: "delete",
      datosAnteriores: prevById.get(id) ?? null,
      datosNuevos: null,
      usuario,
    });
  }
  return entradas;
}

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
    const prevById = new Map(previous.map((c) => [c.id, c]));
    // Solo los campos que esta sesión realmente cambió respecto a su propia
    // copia (`prevById`), no la fila completa — ver patchDeCliente.
    const patches = cambiados.map((c) => patchDeCliente(prevById.get(c.id), c));
    const resultados = await Promise.all([
      patches.length ? upsertClientes(patches) : true,
      eliminados.length ? deleteClientes(eliminados) : true,
    ]);
    return { ok: resultados.every(Boolean), auditoria: auditEntriesClientes(previous, patches, eliminados, usuario) };
  } catch (err) {
    // Igual que commitCitas: si el fetch de la Server Action nunca llega al
    // servidor (offline), la promesa rechaza en vez de resolver `false`.
    console.error("No se pudo guardar (clientes): posible falla de red", err);
    return { ok: false, auditoria: [] };
  }
}
