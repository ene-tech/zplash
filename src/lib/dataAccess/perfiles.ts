import "server-only";

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles } from "@/db/schema";
import type { PerfilPublico } from "@/types";

type PerfilPublicoRow = Pick<typeof perfiles.$inferSelect, "id" | "nombre" | "modulos" | "icono">;

// Nunca incluye "clave": la tabla perfiles solo acepta escrituras de
// nombre/modulos desde acá (ver upsertPerfiles). Crear un perfil nuevo o
// cambiar una clave pasa por rutas server-side dedicadas (/api/perfiles/*).
export function perfilToRow(p: PerfilPublico): Omit<typeof perfiles.$inferInsert, "clave"> {
  return { id: p.id, nombre: p.nombre, modulos: p.modulos, icono: p.icono || null };
}

export function perfilPublicoFromRow(r: PerfilPublicoRow): PerfilPublico {
  return {
    id: r.id,
    nombre: r.nombre,
    modulos: (r.modulos as PerfilPublico["modulos"]) || [],
    icono: r.icono || undefined,
  };
}

// Solo actualiza nombre/modulos (ver perfilToRow) de perfiles que YA
// existen: crear un perfil nuevo con su clave inicial pasa por
// /api/perfiles/crear. Por eso es un UPDATE directo y no un upsert — un
// INSERT (aunque termine resolviendo por ON CONFLICT DO UPDATE) exige que
// la fila propuesta satisfaga el NOT NULL de "clave", que perfilToRow omite
// a propósito para no tocar la contraseña.
export async function upsertPerfiles(rows: PerfilPublico[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    const db = getDb();
    await Promise.all(rows.map((p) => db.update(perfiles).set(perfilToRow(p)).where(eq(perfiles.id, p.id))));
    return true;
  } catch (error) {
    console.error("Error guardando perfiles", error);
    return false;
  }
}

export async function deletePerfiles(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(perfiles).where(inArray(perfiles.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando perfiles", error);
    return false;
  }
}
