import "server-only";

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, conversacionesWhatsapp, mensajesWhatsapp } from "@/db/schema";
import { uid } from "@/lib/helpers";
import type { ConversacionWhatsapp, DireccionMensajeWhatsapp, EstadoMensajeWhatsapp, MensajeWhatsapp, TipoMensajeWhatsapp } from "@/types";

type ConversacionRow = typeof conversacionesWhatsapp.$inferSelect;
type MensajeRow = typeof mensajesWhatsapp.$inferSelect;

export function conversacionFromRow(r: ConversacionRow): ConversacionWhatsapp {
  return {
    id: r.id,
    telefono: r.telefono,
    clienteId: r.clienteId || undefined,
    nombreContacto: r.nombreContacto || undefined,
    ultimoMensajeEn: r.ultimoMensajeEn,
    noLeidos: r.noLeidos,
    creadoEn: r.creadoEn,
  };
}

export function mensajeFromRow(r: MensajeRow): MensajeWhatsapp {
  return {
    id: r.id,
    conversacionId: r.conversacionId,
    direccion: r.direccion as DireccionMensajeWhatsapp,
    texto: r.texto,
    tipo: r.tipo as TipoMensajeWhatsapp,
    estado: (r.estado as EstadoMensajeWhatsapp) || undefined,
    whatsappMessageId: r.whatsappMessageId || undefined,
    enviadoPor: r.enviadoPor || undefined,
    error: r.error || undefined,
    creadoEn: r.creadoEn,
  };
}

// `telefono` siempre en formato "+569XXXXXXXX" (ver formatTelefono en
// @/lib/helpers), igual que clientes.telefono, así el enlace por teléfono es
// una comparación directa sin normalizar en cada lookup.
export async function buscarOCrearConversacion(telefono: string, nombreContacto?: string): Promise<ConversacionWhatsapp> {
  const db = getDb();
  const [existente] = await db.select().from(conversacionesWhatsapp).where(eq(conversacionesWhatsapp.telefono, telefono)).limit(1);
  if (existente) {
    if (nombreContacto && nombreContacto !== existente.nombreContacto) {
      await db.update(conversacionesWhatsapp).set({ nombreContacto }).where(eq(conversacionesWhatsapp.id, existente.id));
      return conversacionFromRow({ ...existente, nombreContacto });
    }
    return conversacionFromRow(existente);
  }

  const [cliente] = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.telefono, telefono)).limit(1);
  const ahora = new Date().toISOString();
  const nueva = {
    id: uid(),
    telefono,
    clienteId: cliente?.id || null,
    nombreContacto: nombreContacto || null,
    ultimoMensajeEn: ahora,
    noLeidos: 0,
    creadoEn: ahora,
  };
  await db.insert(conversacionesWhatsapp).values(nueva);
  return conversacionFromRow(nueva as ConversacionRow);
}

type NuevoMensaje = {
  id: string;
  conversacionId: string;
  direccion: DireccionMensajeWhatsapp;
  texto: string;
  tipo?: TipoMensajeWhatsapp;
  estado?: EstadoMensajeWhatsapp;
  whatsappMessageId?: string;
  enviadoPor?: string;
  error?: string;
};

export async function insertarMensaje(m: NuevoMensaje): Promise<MensajeWhatsapp> {
  const db = getDb();
  const ahora = new Date().toISOString();
  const row = {
    id: m.id,
    conversacionId: m.conversacionId,
    direccion: m.direccion,
    texto: m.texto,
    tipo: m.tipo || "texto",
    estado: m.estado || null,
    whatsappMessageId: m.whatsappMessageId || null,
    enviadoPor: m.enviadoPor || null,
    error: m.error || null,
    creadoEn: ahora,
  };
  await db.insert(mensajesWhatsapp).values(row);
  await db
    .update(conversacionesWhatsapp)
    .set({
      ultimoMensajeEn: ahora,
      noLeidos: m.direccion === "entrante" ? sql`${conversacionesWhatsapp.noLeidos} + 1` : conversacionesWhatsapp.noLeidos,
    })
    .where(eq(conversacionesWhatsapp.id, m.conversacionId));
  return mensajeFromRow(row as MensajeRow);
}

export async function actualizarEstadoMensaje(whatsappMessageId: string, estado: EstadoMensajeWhatsapp): Promise<void> {
  try {
    await getDb().update(mensajesWhatsapp).set({ estado }).where(eq(mensajesWhatsapp.whatsappMessageId, whatsappMessageId));
  } catch (error) {
    console.error("Error actualizando estado de mensaje WhatsApp", whatsappMessageId, error);
  }
}

export async function listarConversaciones(): Promise<ConversacionWhatsapp[]> {
  const rows = await getDb().select().from(conversacionesWhatsapp).orderBy(desc(conversacionesWhatsapp.ultimoMensajeEn));
  return rows.map(conversacionFromRow);
}

export async function listarMensajes(conversacionId: string, limite = 100): Promise<MensajeWhatsapp[]> {
  const rows = await getDb()
    .select()
    .from(mensajesWhatsapp)
    .where(eq(mensajesWhatsapp.conversacionId, conversacionId))
    .orderBy(desc(mensajesWhatsapp.creadoEn))
    .limit(limite);
  return rows.map(mensajeFromRow).reverse();
}

export async function marcarConversacionLeida(conversacionId: string): Promise<void> {
  await getDb().update(conversacionesWhatsapp).set({ noLeidos: 0 }).where(eq(conversacionesWhatsapp.id, conversacionId));
}

// Ventana de 24h de Meta: fuera de ella solo se puede responder con una
// plantilla pre-aprobada, no con texto libre (ver enviarMensajeTexto en
// @/lib/whatsapp/enviar). Se calcula contra el último mensaje ENTRANTE, no
// contra el último mensaje en general.
export async function dentroVentana24h(conversacionId: string): Promise<boolean> {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [ultimo] = await getDb()
    .select({ id: mensajesWhatsapp.id })
    .from(mensajesWhatsapp)
    .where(and(eq(mensajesWhatsapp.conversacionId, conversacionId), eq(mensajesWhatsapp.direccion, "entrante"), gt(mensajesWhatsapp.creadoEn, hace24h)))
    .limit(1);
  return !!ultimo;
}
