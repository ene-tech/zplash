import "server-only";

import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, disparosReglaWhatsapp, mensajesWhatsapp, reglasWhatsapp } from "@/db/schema";
import type { DisparoReglaWhatsapp, EstadoDisparoReglaWhatsapp, HistorialReglaWhatsapp, OrigenTipoDisparoReglaWhatsapp } from "@/types";

type DisparoReglaWhatsappRow = typeof disparosReglaWhatsapp.$inferSelect;

function disparoReglaWhatsappFromRow(r: DisparoReglaWhatsappRow): DisparoReglaWhatsapp {
  return {
    id: r.id,
    reglaId: r.reglaId,
    origenTipo: r.origenTipo as OrigenTipoDisparoReglaWhatsapp,
    origenId: r.origenId,
    clienteId: r.clienteId || undefined,
    patente: r.patente || undefined,
    cuponId: r.cuponId || undefined,
    mensajeWhatsappId: r.mensajeWhatsappId || undefined,
    estado: r.estado as EstadoDisparoReglaWhatsapp,
    enviarEn: r.enviarEn,
    creadoEn: r.creadoEn,
  };
}

type NuevoDisparoReglaWhatsapp = {
  id: string;
  reglaId: string;
  origenTipo: OrigenTipoDisparoReglaWhatsapp;
  origenId: string;
  clienteId?: string;
  patente?: string;
  cuponId?: string;
  mensajeWhatsappId?: string;
  estado: EstadoDisparoReglaWhatsapp;
  enviarEn: string;
};

// Falla en silencio (retorna null) ante el constraint único
// (reglaId, origenTipo, origenId) en vez de propagar el error — así el motor
// de reglas (@/lib/whatsapp/reglas) puede llamar esto "a ciegas" para dos
// eventos que compitan por el mismo disparo (ej. una venta procesada dos
// veces) sin duplicar el envío ni tener que hacer un SELECT previo.
export async function registrarDisparoReglaWhatsapp(d: NuevoDisparoReglaWhatsapp): Promise<DisparoReglaWhatsapp | null> {
  const row = {
    id: d.id,
    reglaId: d.reglaId,
    origenTipo: d.origenTipo,
    origenId: d.origenId,
    clienteId: d.clienteId || null,
    patente: d.patente || null,
    cuponId: d.cuponId || null,
    mensajeWhatsappId: d.mensajeWhatsappId || null,
    estado: d.estado,
    enviarEn: d.enviarEn,
    creadoEn: new Date().toISOString(),
  };
  try {
    await getDb().insert(disparosReglaWhatsapp).values(row);
    return disparoReglaWhatsappFromRow(row as DisparoReglaWhatsappRow);
  } catch (error) {
    console.error("No se pudo registrar disparo de regla WhatsApp (probable duplicado)", d.reglaId, d.origenId, error);
    return null;
  }
}

export async function marcarDisparoReglaWhatsapp(
  id: string,
  cambios: { estado: EstadoDisparoReglaWhatsapp; cuponId?: string; mensajeWhatsappId?: string }
): Promise<void> {
  await getDb()
    .update(disparosReglaWhatsapp)
    .set({
      estado: cambios.estado,
      ...(cambios.cuponId ? { cuponId: cambios.cuponId } : {}),
      ...(cambios.mensajeWhatsappId ? { mensajeWhatsappId: cambios.mensajeWhatsappId } : {}),
    })
    .where(eq(disparosReglaWhatsapp.id, id));
}

export async function listarDisparosProgramadosVencidos(ahoraISO: string): Promise<DisparoReglaWhatsapp[]> {
  const rows = await getDb()
    .select()
    .from(disparosReglaWhatsapp)
    .where(and(eq(disparosReglaWhatsapp.estado, "programado"), lte(disparosReglaWhatsapp.enviarEn, ahoraISO)));
  return rows.map(disparoReglaWhatsappFromRow);
}

// Historial de envíos (Web Settings → Historial WhatsApp) — une cada disparo
// con el nombre de su regla, el cliente y el resultado real del mensaje
// (incluido `error`, ver comentario en @/db/schema/whatsapp), para poder
// auditar qué se mandó y por qué falló sin tener que consultar la base a
// mano como se hizo hoy diagnosticando la plantilla de reseña Google.
export async function listarHistorialReglasWhatsapp(limite = 150): Promise<HistorialReglaWhatsapp[]> {
  const rows = await getDb()
    .select({
      id: disparosReglaWhatsapp.id,
      creadoEn: disparosReglaWhatsapp.creadoEn,
      reglaNombre: reglasWhatsapp.nombre,
      origenTipo: disparosReglaWhatsapp.origenTipo,
      patente: disparosReglaWhatsapp.patente,
      clienteNombre: clientes.nombre,
      estado: disparosReglaWhatsapp.estado,
      mensajeTexto: mensajesWhatsapp.texto,
      mensajeEstado: mensajesWhatsapp.estado,
      mensajeError: mensajesWhatsapp.error,
    })
    .from(disparosReglaWhatsapp)
    .leftJoin(reglasWhatsapp, eq(disparosReglaWhatsapp.reglaId, reglasWhatsapp.id))
    .leftJoin(clientes, eq(disparosReglaWhatsapp.clienteId, clientes.id))
    .leftJoin(mensajesWhatsapp, eq(disparosReglaWhatsapp.mensajeWhatsappId, mensajesWhatsapp.id))
    .orderBy(desc(disparosReglaWhatsapp.creadoEn))
    .limit(limite);

  return rows.map((r) => ({
    id: r.id,
    creadoEn: r.creadoEn,
    reglaNombre: r.reglaNombre || "(regla eliminada)",
    origenTipo: r.origenTipo as OrigenTipoDisparoReglaWhatsapp,
    patente: r.patente || undefined,
    clienteNombre: r.clienteNombre || undefined,
    estado: r.estado as EstadoDisparoReglaWhatsapp,
    mensajeTexto: r.mensajeTexto || undefined,
    mensajeEstado: (r.mensajeEstado as HistorialReglaWhatsapp["mensajeEstado"]) || undefined,
    mensajeError: r.mensajeError || undefined,
  }));
}
