import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Cacheado en globalThis y construido perezosamente (no al importar el
// módulo) para que el build no falle solo por no tener DATABASE_URL seteada
// en un entorno donde estas rutas no se van a invocar todavía, y para no
// abrir una conexión nueva en cada hot-reload de `next dev` — mismo patrón
// que ya usaba getSupabaseAdmin().
const globalForDb = globalThis as unknown as { db?: PostgresJsDatabase<typeof schema> };

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL en las variables de entorno");
    // prepare:false porque el pooler de Supabase en modo transacción
    // (pgbouncer, puerto 6543) no soporta prepared statements.
    const client = postgres(url, { prepare: false });
    globalForDb.db = drizzle(client, { schema });
  }
  return globalForDb.db;
}
