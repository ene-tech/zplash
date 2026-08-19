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
    // max:64 (por defecto postgres.js usa 10): loadCore() + loadHistorial()
    // (ver dataAccess/loadAll.ts) disparan sus queries en paralelo con
    // Promise.all, y AppContext lanza las dos oleadas a la vez (40 hoy).
    // Verificado a mano: si `max` es menor que la cantidad de queries
    // concurrentes, postgres.js (con prepare:false) no solo hace cola
    // prolijamente — directamente se cuelga para siempre, o entrega
    // respuestas corruptas de una query multiplexada con otra en la misma
    // conexión (reproducido con max:1..4: nunca resuelve; con max:6+,
    // siempre resuelve en ~2s). Esa fue la causa real de "Cargando datos..."
    // colgado hasta que Vercel mataba la función a los 300s, y reapareció al
    // agregar tablas y pasar el `max` de turno. Dejar buen margen sobre el conteo
    // actual de loadAll() para no repetir esto cada vez que se agregue una
    // tabla; es seguro porque el pooler en modo transacción está hecho para
    // absorber muchas conexiones cliente concurrentes (a diferencia del modo
    // sesión).
    const client = postgres(url, { prepare: false, max: 64 });
    globalForDb.db = drizzle(client, { schema });
  }
  return globalForDb.db;
}
