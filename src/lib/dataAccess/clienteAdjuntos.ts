import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clienteAdjuntos } from "@/db/schema";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { ClienteAdjunto } from "@/types";

// Bucket PRIVADO (ver supabase/cliente-adjuntos-2026-11-10.sql): comprobantes
// de devolución y otros documentos con datos del cliente, así que nunca URL
// pública. El navegador sube directo con una URL firmada de subida (los
// archivos pasan del límite de cuerpo de las Server Actions y de Vercel) y
// los ve con una URL firmada de 5 minutos.
const BUCKET = "adjuntos-clientes";

type Fila = typeof clienteAdjuntos.$inferSelect;

function adjuntoFromRow(r: Fila): ClienteAdjunto {
  return {
    id: r.id,
    clienteId: r.clienteId,
    tipo: r.tipo as ClienteAdjunto["tipo"],
    detalle: r.detalle ?? undefined,
    nombreArchivo: r.nombreArchivo,
    tipoMime: r.tipoMime ?? undefined,
    tamano: r.tamano ?? undefined,
    subidoEn: r.subidoEn,
    subidoPor: r.subidoPor ?? undefined,
  };
}

// Sin try/catch a propósito: un error de base tiene que llegar a la ficha
// como error, no como null (que la Server Action usa para "sin permiso" y
// esconde la sección).
export async function listarAdjuntosCliente(clienteId: string): Promise<ClienteAdjunto[]> {
  const filas = await getDb()
    .select()
    .from(clienteAdjuntos)
    .where(eq(clienteAdjuntos.clienteId, clienteId))
    .orderBy(desc(clienteAdjuntos.subidoEn));
  return filas.map(adjuntoFromRow);
}

/** URL firmada para que el navegador suba el archivo a `ruta`, o null si falló. */
export async function urlSubidaAdjuntoCliente(ruta: string): Promise<{ ruta: string; token: string } | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (error || !data) {
    console.error("Error firmando subida de adjunto", error);
    return null;
  }
  return { ruta: data.path, token: data.token };
}

/** true si el archivo ya está en el bucket (se revisa antes de anotarlo en la tabla). */
export async function existeArchivoAdjunto(ruta: string): Promise<boolean> {
  const corte = ruta.lastIndexOf("/");
  const carpeta = ruta.slice(0, corte);
  const nombre = ruta.slice(corte + 1);
  const { data } = await getSupabaseAdmin().storage.from(BUCKET).list(carpeta, { search: nombre });
  return !!data?.some((a) => a.name === nombre);
}

export async function insertarAdjuntoCliente(fila: typeof clienteAdjuntos.$inferInsert): Promise<ClienteAdjunto | null> {
  try {
    const [r] = await getDb().insert(clienteAdjuntos).values(fila).returning();
    return r ? adjuntoFromRow(r) : null;
  } catch (error) {
    console.error("Error guardando adjunto del cliente", error);
    return null;
  }
}

/** URL firmada de 5 minutos para ver/descargar el adjunto, o null si no existe. */
export async function urlAdjuntoCliente(clienteId: string, id: string): Promise<string | null> {
  const [fila] = await getDb()
    .select({ ruta: clienteAdjuntos.ruta })
    .from(clienteAdjuntos)
    .where(and(eq(clienteAdjuntos.id, id), eq(clienteAdjuntos.clienteId, clienteId)));
  if (!fila) return null;
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUrl(fila.ruta, 300);
  if (error || !data) {
    console.error("Error firmando adjunto del cliente", error);
    return null;
  }
  return data.signedUrl;
}
