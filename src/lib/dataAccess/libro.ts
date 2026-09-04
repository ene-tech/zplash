import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { libroComentarios } from "@/db/schema";
import type { LibroComentario, TipoLibro } from "@/types";

function comentarioFromRow(r: typeof libroComentarios.$inferSelect): LibroComentario {
  return { id: r.id, email: r.email, tipo: r.tipo as TipoLibro, mensaje: r.mensaje, creadoEn: r.creadoEn };
}

export async function crearComentarioLibro(row: { id: string; email: string; tipo: TipoLibro; mensaje: string }): Promise<boolean> {
  try {
    // Minúsculas SIEMPRE acá, el único punto de escritura: el matching de la
    // ficha y de Mi Cuenta depende de este invariante, y un segundo escritor
    // futuro (backfill, intake por WhatsApp) no tiene por qué acordarse.
    await getDb()
      .insert(libroComentarios)
      .values({ ...row, email: row.email.trim().toLowerCase() });
    return true;
  } catch (error) {
    console.error("Error guardando comentario del libro", error);
    return false;
  }
}

/** Sin argumento: el libro completo (vista Libro del panel). Con email: solo
 * las entradas de esa persona (la ficha de cliente y el "mis comentarios" de
 * Mi Cuenta). Un email presente pero vacío devuelve [] y nunca cae al libro
 * completo: "todo" tiene que ser una decisión del caller, no el resultado de
 * un string vacío que se coló. */
export async function listarComentariosLibro(email?: string): Promise<LibroComentario[]> {
  try {
    const db = getDb();
    if (email !== undefined) {
      const normalizado = email.trim().toLowerCase();
      if (!normalizado) return [];
      const rows = await db
        .select()
        .from(libroComentarios)
        .where(eq(libroComentarios.email, normalizado))
        .orderBy(desc(libroComentarios.creadoEn));
      return rows.map(comentarioFromRow);
    }
    // Mismo tope que las consultas de historial de recorrido.ts: la vista
    // Libro muestra lo más reciente, no necesita transferir el libro entero.
    // ponytail: cap fijo de 200; paginar si el libro crece de verdad.
    const rows = await db.select().from(libroComentarios).orderBy(desc(libroComentarios.creadoEn)).limit(200);
    return rows.map(comentarioFromRow);
  } catch (error) {
    console.error("Error leyendo el libro de comentarios", error);
    return [];
  }
}
