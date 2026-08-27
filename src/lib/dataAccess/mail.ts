import "server-only";

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, correosAutomaticos, disparosReglaCorreo, plantillasCorreo, reglasCorreo } from "@/db/schema";
import type {
  CorreoAutomatico,
  CorreoAutomaticoResumen,
  DisparoReglaCorreo,
  EstadoCorreoAutomatico,
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
    condicionSoloConPromoRenovacion: r.condicionSoloConPromoRenovacion || false,
    condicionDiasDespuesVencimiento: r.condicionDiasDespuesVencimiento ?? null,
    condicionPasadasMax: r.condicionPasadasMax ?? null,
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
    condicionSoloConPromoRenovacion: r.condicionSoloConPromoRenovacion || undefined,
    condicionDiasDespuesVencimiento: r.condicionDiasDespuesVencimiento ?? undefined,
    condicionPasadasMax: r.condicionPasadasMax ?? undefined,
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

/**
 * La ReglaCorreo "percha" de tipoEvento="envio_manual" que ampara los envíos
 * puntuales de UNA plantilla desde Web Settings → Correos Únicos, creándola la
 * primera vez. No es una regla de negocio: nace con activa=false y ningún hook
 * ni el cron la evalúan (ver comentario de TipoEventoReglaCorreo) — existe
 * solo porque disparos_regla_correo.regla_id es NOT NULL, y colgarse de ella
 * da gratis la auditoría en Historial Correo y la idempotencia por el unique
 * (regla_id, origen_tipo, origen_id).
 *
 * Una por plantilla (no una sola global) justamente por ese unique: con una
 * percha compartida, mandar la plantilla A a un cliente lo dejaría fuera de un
 * envío posterior de la plantilla B en el mismo ciclo, que no tiene nada que
 * ver.
 */
export async function obtenerOCrearReglaEnvioManual(plantillaCorreoId: string, creadoPor?: string): Promise<ReglaCorreo | null> {
  const db = getDb();
  const [existente] = await db
    .select()
    .from(reglasCorreo)
    .where(and(eq(reglasCorreo.tipoEvento, "envio_manual"), eq(reglasCorreo.plantillaCorreoId, plantillaCorreoId)))
    .limit(1);
  if (existente) return reglaCorreoFromRow(existente);

  const [plantilla] = await db.select().from(plantillasCorreo).where(eq(plantillasCorreo.id, plantillaCorreoId)).limit(1);
  if (!plantilla) {
    console.error("No se puede crear la regla de envío manual: plantilla inexistente", plantillaCorreoId);
    return null;
  }

  const fila = {
    id: `envio-manual-${plantillaCorreoId}`,
    nombre: `Envío manual — ${plantilla.nombre}`,
    activa: false,
    tipoEvento: "envio_manual",
    condicionSoloSinAutopago: false,
    condicionSoloConPromoRenovacion: false,
    delayDias: 0,
    plantillaCorreoId,
    creadoEn: new Date().toISOString(),
    creadoPor: creadoPor || null,
  };
  try {
    await db.insert(reglasCorreo).values(fila);
    return reglaCorreoFromRow(fila as typeof reglasCorreo.$inferSelect);
  } catch (error) {
    // Carrera entre dos admins mandando la misma plantilla a la vez: el id es
    // determinístico (derivado de la plantilla), así que el segundo insert
    // choca contra la PK — se relee en vez de fallar el envío.
    console.error("Error creando la regla de envío manual, releyendo", plantillaCorreoId, error);
    const [reintento] = await db.select().from(reglasCorreo).where(eq(reglasCorreo.id, fila.id)).limit(1);
    return reintento ? reglaCorreoFromRow(reintento) : null;
  }
}

/**
 * Ids de clientes a los que YA se les envió con éxito una plantilla puntual
 * desde `desdeISO` — para que Correos Únicos los pre-excluya de la selección
 * (mismo propósito que clienteIdsConMensajePlantilla en WhatsApp). Es solo
 * ayuda visual: la garantía dura contra duplicados es el unique de
 * disparos_regla_correo, no esto.
 */
export async function clienteIdsConCorreoDePlantilla(plantillaCorreoId: string, desdeISO: string): Promise<string[]> {
  const rows = await getDb()
    .select({ clienteId: disparosReglaCorreo.clienteId })
    .from(disparosReglaCorreo)
    .innerJoin(reglasCorreo, eq(reglasCorreo.id, disparosReglaCorreo.reglaId))
    .where(
      and(
        eq(reglasCorreo.plantillaCorreoId, plantillaCorreoId),
        eq(disparosReglaCorreo.estado, "enviado"),
        gte(disparosReglaCorreo.creadoEn, desdeISO)
      )
    );
  return rows.map((r) => r.clienteId).filter((id): id is string => !!id);
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

// Borra un disparo ya registrado. Único uso: cuando el correo falló por una
// dirección irrecuperable y se le borró el email al cliente — dejar la fila
// bloquearía el reenvío por el unique (regla_id, origen_tipo, origen_id)
// durante todo el ciclo de plan, justo cuando el operador va a capturar la
// dirección buena. Ver ejecutarAccionReglaCorreo.
export async function eliminarDisparoReglaCorreo(id: string): Promise<void> {
  try {
    await getDb().delete(disparosReglaCorreo).where(eq(disparosReglaCorreo.id, id));
  } catch (error) {
    console.error("No se pudo borrar el disparo de correo tras una dirección inválida", id, error);
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

// ---- Bandeja de salida del remitente automático (ver comentario de
// correosAutomaticos en @/db/schema/mail) ----

/**
 * Guarda la copia de un correo que ya salió (o que falló al salir) por el
 * remitente automático. Nunca lanza ni retorna error: la llama
 * enviarCorreoTransaccional DESPUÉS de que el proveedor respondió, así que un
 * problema guardando la copia no puede volverse un fallo de envío — el correo
 * ya está en la calle. Solo se pierde la fila de auditoría, y queda en el log.
 */
export async function registrarCorreoAutomatico(c: {
  id: string;
  de: string;
  para: string;
  asunto: string;
  html: string;
  estado: EstadoCorreoAutomatico;
  error?: string;
  proveedorId?: string;
  disparoId?: string;
  clienteId?: string;
}): Promise<void> {
  try {
    await getDb()
      .insert(correosAutomaticos)
      .values({
        id: c.id,
        de: c.de,
        para: c.para,
        asunto: c.asunto,
        html: c.html,
        estado: c.estado,
        error: c.error || null,
        proveedorId: c.proveedorId || null,
        disparoId: c.disparoId || null,
        clienteId: c.clienteId || null,
        creadoEn: new Date().toISOString(),
      });
  } catch (error) {
    console.error("No se pudo guardar la copia del correo automático", c.para, c.asunto, error);
  }
}

// Lista para Correo → Salida automática. Sin el HTML del cuerpo a propósito
// (ver CorreoAutomaticoResumen): con 200 correos de diseño completo la
// respuesta pesaría megabytes para mostrar solo asunto y destinatario.
export async function listarCorreosAutomaticos(limite = 200): Promise<CorreoAutomaticoResumen[]> {
  const rows = await getDb()
    .select({
      id: correosAutomaticos.id,
      de: correosAutomaticos.de,
      para: correosAutomaticos.para,
      asunto: correosAutomaticos.asunto,
      estado: correosAutomaticos.estado,
      error: correosAutomaticos.error,
      clienteNombre: clientes.nombre,
      creadoEn: correosAutomaticos.creadoEn,
    })
    .from(correosAutomaticos)
    .leftJoin(clientes, eq(correosAutomaticos.clienteId, clientes.id))
    .orderBy(desc(correosAutomaticos.creadoEn))
    .limit(limite);

  return rows.map((r) => ({
    id: r.id,
    de: r.de,
    para: r.para,
    asunto: r.asunto,
    estado: r.estado as EstadoCorreoAutomatico,
    error: r.error || undefined,
    clienteNombre: r.clienteNombre || undefined,
    creadoEn: r.creadoEn,
  }));
}

export async function obtenerCorreoAutomatico(id: string): Promise<CorreoAutomatico | null> {
  const [row] = await getDb()
    .select({
      id: correosAutomaticos.id,
      de: correosAutomaticos.de,
      para: correosAutomaticos.para,
      asunto: correosAutomaticos.asunto,
      html: correosAutomaticos.html,
      estado: correosAutomaticos.estado,
      error: correosAutomaticos.error,
      proveedorId: correosAutomaticos.proveedorId,
      clienteNombre: clientes.nombre,
      creadoEn: correosAutomaticos.creadoEn,
    })
    .from(correosAutomaticos)
    .leftJoin(clientes, eq(correosAutomaticos.clienteId, clientes.id))
    .where(eq(correosAutomaticos.id, id))
    .limit(1);
  if (!row) return null;

  return {
    id: row.id,
    de: row.de,
    para: row.para,
    asunto: row.asunto,
    html: row.html,
    estado: row.estado as EstadoCorreoAutomatico,
    error: row.error || undefined,
    proveedorId: row.proveedorId || undefined,
    clienteNombre: row.clienteNombre || undefined,
    creadoEn: row.creadoEn,
  };
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
