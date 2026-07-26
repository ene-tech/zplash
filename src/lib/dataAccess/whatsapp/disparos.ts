import "server-only";

import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { disparosReglaWhatsapp } from "@/db/schema";
import type { DisparoReglaWhatsapp, EstadoDisparoReglaWhatsapp, OrigenTipoDisparoReglaWhatsapp } from "@/types";

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
