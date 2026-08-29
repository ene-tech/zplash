import "server-only";

import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { getDb } from "@/db";

// Cada query de loadAll se aísla: si una tabla falla (o la conexión no está
// lista aún), las demás igual se cargan y esta cae a [] — lo mismo que hacía
// antes el chequeo de `res.error` por separado con supabase-js. Los `?.length`
// en loadAll hacen que un [] caiga a los valores DEFAULT correspondientes.
export async function safe<T>(query: Promise<T[]>): Promise<T[]> {
  try {
    return await query;
  } catch (error) {
    console.error("Error cargando datos de la base de datos", error);
    return [];
  }
}

function buildConflictUpdateColumns<T extends PgTable>(table: T, columns: string[]): Record<string, SQL> {
  const cls = getTableColumns(table);
  const set: Record<string, SQL> = {};
  for (const column of columns) {
    set[column] = sql.raw(`excluded.${cls[column].name}`);
  }
  return set;
}

// Upsert genérico: inserta `rows` y, si el valor de `target` ya existe,
// actualiza el resto de las columnas presentes en cada fila. Comparte esta
// lógica entre las tablas que hacen upsert en vez de repetirla.
export async function upsertRows<T extends PgTable>(table: T, target: PgColumn, rows: Record<string, unknown>[]): Promise<void> {
  const columns = Object.keys(rows[0]).filter((k) => k !== target.name);
  await getDb()
    .insert(table)
    .values(rows as never[])
    .onConflictDoUpdate({ target, set: buildConflictUpdateColumns(table, columns) });
}

/**
 * Borra las claves con valor `undefined` de cada fila de cada arreglo de
 * `data`. Devuelve el mismo objeto (lo muta: se llama sobre uno recién
 * construido).
 *
 * Los mapeadores `*FromRow` usan `campo: r.campo || undefined` para los
 * opcionales. `JSON.stringify` borra esas claves, pero loadCore/loadHistorial
 * viajan al navegador por una Server Action, y el serializador de React SÍ
 * manda cada una: `"campo":"$undefined"`, ~16 bytes + el nombre, por fila.
 *
 * Medido el 2026-08-28 contra producción: el login mandaba 12,4 MB, de los
 * cuales 5,5 MB eran esa cadena repetida (ventas +170% sobre su tamaño real,
 * ingresos +63%, clientes +57%, movimientosContables +52%). Gzip la aplasta
 * en la red —el ahorro ahí es de solo 83 kB— pero el navegador igual
 * descomprime, parsea y aloja los 12,4 MB: eso es lo que se ahorra, y es lo
 * que se nota en el equipo del mesón.
 *
 * Sacar la clave es equivalente a dejarla en `undefined` para todo lo que la
 * lee (`c.rut`, `x !== undefined`, el diff por `Object.keys` de
 * @/lib/helpers/clientes): solo cambiaría para un `"rut" in c`, que no existe
 * en el código.
 */
export function sinClavesVacias<T extends Record<string, unknown>>(data: T): T {
  for (const clave in data) {
    const valor = data[clave];
    if (!Array.isArray(valor)) continue;
    (data as Record<string, unknown>)[clave] = valor.map((fila) => {
      if (!fila || typeof fila !== "object") return fila;
      const limpia: Record<string, unknown> = {};
      for (const k in fila) if (fila[k] !== undefined) limpia[k] = fila[k];
      return limpia;
    });
  }
  return data;
}
