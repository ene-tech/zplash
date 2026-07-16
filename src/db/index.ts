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

// Tipo compartido para funciones de @/lib que deben poder ejecutar dentro de
// una transacción del llamador (pasando `tx`) o standalone contra la
// conexión normal (default `getDb()`) — ver aplicarPagoAprobado en
// @/lib/pagos, que ahora corre dentro de la misma transacción que el resto
// de la escritura de un pago para que no queden cambios a medio aplicar si
// algo falla a mitad de camino.
export type DbOrTx = PostgresJsDatabase<typeof schema> | Parameters<Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]>[0];

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL en las variables de entorno");
    // prepare:false porque el pooler de Supabase en modo transacción
    // (pgbouncer, puerto 6543) no soporta prepared statements.
    //
    // max:20 (por defecto postgres.js usa 10): loadAll() (ver dataAccess.ts)
    // dispara 14 queries en paralelo con Promise.all. Verificado a mano: si
    // `max` es menor que la cantidad de queries concurrentes, postgres.js
    // (con prepare:false) no solo hace cola prolijamente — directamente se
    // cuelga para siempre cuando dos+ queries distintas terminan
    // multiplexadas en la misma conexión (reproducido con max:1..4: nunca
    // resuelve; con max:6+, siempre resuelve en ~2s). Eso era la causa real
    // de "Cargando datos..." colgado hasta que Vercel mataba la función a
    // los 300s. max:20 deja margen sobre las 14 queries de loadAll(); es
    // seguro porque el pooler en modo transacción está hecho para absorber
    // muchas conexiones cliente concurrentes (a diferencia del modo sesión).
    const client = postgres(url, { prepare: false, max: 20 });
    globalForDb.db = drizzle(client, { schema });
  }
  return globalForDb.db;
}
