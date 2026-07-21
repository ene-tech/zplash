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
