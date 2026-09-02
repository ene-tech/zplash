import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { opiniones } from "@/db/schema";
import { uid } from "@/lib/helpers";

// La nota se guarda apenas llega, sin esperar el comentario: el que puntúa y
// se va sin escribir nada más es la mayoría, y esa nota es justamente el dato
// que se quiere. El comentario se agrega después con agregarComentarioOpinion
// si el flujo llega hasta ahí (ver manejarPasoOpinion en @/lib/whatsapp/router).
export async function insertarOpinion(o: { telefono: string; nota: number; clienteId?: string }): Promise<{ id: string }> {
  const id = uid();
  await getDb()
    .insert(opiniones)
    .values({ id, telefono: o.telefono, nota: o.nota, clienteId: o.clienteId || null, creadoEn: new Date().toISOString() });
  return { id };
}

export async function agregarComentarioOpinion(id: string, comentario: string): Promise<void> {
  await getDb().update(opiniones).set({ comentario }).where(eq(opiniones.id, id));
}
