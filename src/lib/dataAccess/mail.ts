import "server-only";

import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, disparosReglaCorreo, plantillasCorreo, reglasCorreo } from "@/db/schema";
import type {
  DisparoReglaCorreo,
  EstadoDisparoReglaCorreo,
  HistorialReglaCorreo,
  OrigenTipoDisparoReglaCorreo,
  PlantillaCorreo,
  ReglaCorreo,
  TipoEventoReglaCorreo,
} from "@/types";
import { upsertRows } from "./shared";

type PlantillaCorreoRow = typeof plantillasCorreo.$inferSelect;

function plantillaCorreoToRow(p: PlantillaCorreo): typeof plantillasCorreo.$inferInsert {
  return { id: p.id, nombre: p.nombre, categoria: p.categoria || null, asunto: p.asunto, cuerpo: p.cuerpo, activo: p.activo };
}

export function plantillaCorreoFromRow(r: PlantillaCorreoRow): PlantillaCorreo {
  return { id: r.id, nombre: r.nombre, categoria: r.categoria || undefined, asunto: r.asunto, cuerpo: r.cuerpo, activo: r.activo };
}

export async function upsertPlantillasCorreo(rows: PlantillaCorreo[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(plantillasCorreo, plantillasCorreo.id, rows.map(plantillaCorreoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando plantillas de correo", error);
    return false;
  }
}

export async function deletePlantillasCorreo(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(plantillasCorreo).where(inArray(plantillasCorreo.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando plantillas de correo", error);
    return false;
  }
}

// ---- Reglas de correo (motor en paralelo al de WhatsApp, ver
// @/db/schema/mailReglas) ----

type ReglaCorreoRow = typeof reglasCorreo.$inferSelect;

function reglaCorreoToRow(r: ReglaCorreo): typeof reglasCorreo.$inferInsert {
  return {
    id: r.id,
    nombre: r.nombre,
    activa: r.activa,
    tipoEvento: r.tipoEvento,
    condicionTipoVenta: r.condicionTipoVenta || null,
    condicionPlanes: r.condicionPlanes?.length ? r.condicionPlanes : null,
    condicionDiasAntesVencimiento: r.condicionDiasAntesVencimiento ?? null,
    condicionSoloSinAutopago: r.condicionSoloSinAutopago || false,
    condicionDiasDespuesVencimiento: r.condicionDiasDespuesVencimiento ?? null,
    delayDias: r.delayDias || 0,
    plantillaCorreoId: r.plantillaCorreoId,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || null,
  };
}

export function reglaCorreoFromRow(r: ReglaCorreoRow): ReglaCorreo {
  return {
    id: r.id,
    nombre: r.nombre,
    activa: r.activa,
    tipoEvento: r.tipoEvento as TipoEventoReglaCorreo,
    condicionTipoVenta: r.condicionTipoVenta || undefined,
    condicionPlanes: r.condicionPlanes?.length ? r.condicionPlanes : undefined,
    condicionDiasAntesVencimiento: r.condicionDiasAntesVencimiento ?? undefined,
    condicionSoloSinAutopago: r.condicionSoloSinAutopago || undefined,
    condicionDiasDespuesVencimiento: r.condicionDiasDespuesVencimiento ?? undefined,
    delayDias: r.delayDias || 0,
    plantillaCorreoId: r.plantillaCorreoId,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function obtenerPlantillaCorreo(id: string): Promise<PlantillaCorreo | null> {
  const [row] = await getDb().select().from(plantillasCorreo).where(eq(plantillasCorreo.id, id)).limit(1);
  return row ? plantillaCorreoFromRow(row) : null;
}

export async function upsertReglasCorreo(rows: ReglaCorreo[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(reglasCorreo, reglasCorreo.id, rows.map(reglaCorreoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando reglas de correo", error);
    return false;
  }
}

export async function deleteReglasCorreo(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(reglasCorreo).where(inArray(reglasCorreo.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando reglas de correo", error);
    return false;
  }
}

export async function listarReglasCorreoActivas(tipoEvento: TipoEventoReglaCorreo): Promise<ReglaCorreo[]> {
  const rows = await getDb()
    .select()
    .from(reglasCorreo)
    .where(and(eq(reglasCorreo.activa, true), eq(reglasCorreo.tipoEvento, tipoEvento)));
  return rows.map(reglaCorreoFromRow);
}

// ---- Disparos de reglas de correo (auditoría + idempotencia) ----

type DisparoReglaCorreoRow = typeof disparosReglaCorreo.$inferSelect;

function disparoReglaCorreoFromRow(r: DisparoReglaCorreoRow): DisparoReglaCorreo {
  return {
    id: r.id,
    reglaId: r.reglaId,
    origenTipo: r.origenTipo as OrigenTipoDisparoReglaCorreo,
    origenId: r.origenId,
    clienteId: r.clienteId || undefined,
    patente: r.patente || undefined,
    estado: r.estado as EstadoDisparoReglaCorreo,
    error: r.error || undefined,
    enviarEn: r.enviarEn,
    creadoEn: r.creadoEn,
  };
}

type NuevoDisparoReglaCorreo = {
  id: string;
  reglaId: string;
  origenTipo: OrigenTipoDisparoReglaCorreo;
  origenId: string;
  clienteId?: string;
  patente?: string;
  estado: EstadoDisparoReglaCorreo;
  enviarEn: string;
};

// Falla en silencio (retorna null) ante el constraint único
// (reglaId, origenTipo, origenId) — mismo patrón que
// registrarDisparoReglaWhatsapp (ver @/lib/dataAccess/whatsapp/disparos):
// permite llamar esto "a ciegas" sin un SELECT previo, y un intento duplicado
// (ej. el botón de migración Woo apretado dos veces) simplemente no dispara
// de nuevo.
export async function registrarDisparoReglaCorreo(d: NuevoDisparoReglaCorreo): Promise<DisparoReglaCorreo | null> {
  const row = {
    id: d.id,
    reglaId: d.reglaId,
    origenTipo: d.origenTipo,
    origenId: d.origenId,
    clienteId: d.clienteId || null,
    patente: d.patente || null,
    estado: d.estado,
    error: null,
    enviarEn: d.enviarEn,
    creadoEn: new Date().toISOString(),
  };
  try {
    await getDb().insert(disparosReglaCorreo).values(row);
    return disparoReglaCorreoFromRow(row as DisparoReglaCorreoRow);
  } catch (error) {
    console.error("No se pudo registrar disparo de regla de correo (probable duplicado)", d.reglaId, d.origenId, error);
    return null;
  }
}

export async function marcarDisparoReglaCorreo(id: string, cambios: { estado: EstadoDisparoReglaCorreo; error?: string }): Promise<void> {
  await getDb()
    .update(disparosReglaCorreo)
    .set({ estado: cambios.estado, error: cambios.error || null })
    .where(eq(disparosReglaCorreo.id, id));
}

export async function listarDisparosProgramadosCorreoVencidos(ahoraISO: string): Promise<DisparoReglaCorreo[]> {
  const rows = await getDb()
    .select()
    .from(disparosReglaCorreo)
    .where(and(eq(disparosReglaCorreo.estado, "programado"), lte(disparosReglaCorreo.enviarEn, ahoraISO)));
  return rows.map(disparoReglaCorreoFromRow);
}

// Historial de envíos (Web Settings → Historial Correo) — mismo propósito
// que listarHistorialReglasWhatsapp (ver @/lib/dataAccess/whatsapp/disparos).
export async function listarHistorialReglasCorreo(limite = 150): Promise<HistorialReglaCorreo[]> {
  const rows = await getDb()
    .select({
      id: disparosReglaCorreo.id,
      creadoEn: disparosReglaCorreo.creadoEn,
      reglaNombre: reglasCorreo.nombre,
      origenTipo: disparosReglaCorreo.origenTipo,
      patente: disparosReglaCorreo.patente,
      clienteNombre: clientes.nombre,
      estado: disparosReglaCorreo.estado,
      error: disparosReglaCorreo.error,
    })
    .from(disparosReglaCorreo)
    .leftJoin(reglasCorreo, eq(disparosReglaCorreo.reglaId, reglasCorreo.id))
    .leftJoin(clientes, eq(disparosReglaCorreo.clienteId, clientes.id))
    .orderBy(desc(disparosReglaCorreo.creadoEn))
    .limit(limite);

  return rows.map((r) => ({
    id: r.id,
    creadoEn: r.creadoEn,
    reglaNombre: r.reglaNombre || "(regla eliminada)",
    origenTipo: r.origenTipo as OrigenTipoDisparoReglaCorreo,
    patente: r.patente || undefined,
    clienteNombre: r.clienteNombre || undefined,
    estado: r.estado as EstadoDisparoReglaCorreo,
    error: r.error || undefined,
  }));
}
