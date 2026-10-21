import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { correosSuprimidos } from "@/db/schema";

export type MotivoSupresion = "rebote" | "queja" | "manual";

/**
 * Supresión vigente para una dirección YA normalizada, o null. Si la consulta
 * falla (típicamente: la tabla todavía no existe porque el SQL se pega a
 * mano) devuelve null y loguea — el correo sale igual, como antes de que
 * existiera la lista.
 */
export async function buscarSupresionCorreo(email: string): Promise<{ motivo: MotivoSupresion; detalle: string | null } | null> {
  try {
    const [fila] = await getDb()
      .select({ motivo: correosSuprimidos.motivo, detalle: correosSuprimidos.detalle })
      .from(correosSuprimidos)
      .where(eq(correosSuprimidos.email, email))
      .limit(1);
    return fila ? { motivo: fila.motivo as MotivoSupresion, detalle: fila.detalle } : null;
  } catch (error) {
    console.error("No se pudo consultar correos_suprimidos (¿falta pegar el SQL?); se envía igual", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Agrega direcciones (normalizadas) a la supresión. Si ya estaban, deja la
 * primera fila (no pisa una "manual" con un rebote posterior). Lanza si falla:
 * el webhook responde 500 y SNS reintenta.
 */
export async function suprimirCorreos(filas: { email: string; motivo: MotivoSupresion; detalle?: string }[]): Promise<void> {
  if (!filas.length) return;
  await getDb()
    .insert(correosSuprimidos)
    .values(filas.map((f) => ({ email: f.email, motivo: f.motivo, detalle: f.detalle || null, creadoEn: new Date().toISOString() })))
    .onConflictDoNothing({ target: correosSuprimidos.email });
}
