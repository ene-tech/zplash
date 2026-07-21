import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bloqueosAgenda, citaServicios, citas, horariosAgenda } from "@/db/schema";
import type { BloqueoAgenda, Cita, HorarioAgenda } from "@/types";
import { upsertRows } from "./shared";

type HorarioAgendaRow = typeof horariosAgenda.$inferSelect;
type BloqueoAgendaRow = typeof bloqueosAgenda.$inferSelect;
type CitaRow = typeof citas.$inferSelect;

function horarioAgendaToRow(h: HorarioAgenda): typeof horariosAgenda.$inferInsert {
  return { id: h.id, diaSemana: h.diaSemana, horaInicio: h.horaInicio, horaFin: h.horaFin };
}

export function horarioAgendaFromRow(r: HorarioAgendaRow): HorarioAgenda {
  return { id: r.id, diaSemana: r.diaSemana, horaInicio: r.horaInicio, horaFin: r.horaFin };
}

// El horario semanal se maneja como reemplazo completo vía diff (igual que
// clientes/empresas, ver diffPorId en AppContext.tsx): el formulario arma la
// lista deseada completa y acá solo se hace upsert/delete de lo que cambió.
export async function upsertHorariosAgenda(rows: HorarioAgenda[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(horariosAgenda, horariosAgenda.id, rows.map(horarioAgendaToRow));
    return true;
  } catch (error) {
    console.error("Error guardando horarios de agenda", error);
    return false;
  }
}

export async function deleteHorariosAgenda(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(horariosAgenda).where(inArray(horariosAgenda.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando horarios de agenda", error);
    return false;
  }
}

function bloqueoAgendaToRow(b: BloqueoAgenda): typeof bloqueosAgenda.$inferInsert {
  return {
    id: b.id,
    fecha: b.fecha,
    todoElDia: b.todoElDia,
    horaInicio: b.horaInicio || null,
    horaFin: b.horaFin || null,
    motivo: b.motivo || null,
    creadoEn: b.creadoEn,
    creadoPor: b.creadoPor || null,
  };
}

export function bloqueoAgendaFromRow(r: BloqueoAgendaRow): BloqueoAgenda {
  return {
    id: r.id,
    fecha: r.fecha,
    todoElDia: r.todoElDia,
    horaInicio: r.horaInicio || undefined,
    horaFin: r.horaFin || undefined,
    motivo: r.motivo || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

export async function upsertBloqueosAgenda(rows: BloqueoAgenda[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(bloqueosAgenda, bloqueosAgenda.id, rows.map(bloqueoAgendaToRow));
    return true;
  } catch (error) {
    console.error("Error guardando bloqueos de agenda", error);
    return false;
  }
}

export async function deleteBloqueosAgenda(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(bloqueosAgenda).where(inArray(bloqueosAgenda.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando bloqueos de agenda", error);
    return false;
  }
}

function citaToRow(c: Cita): typeof citas.$inferInsert {
  return {
    id: c.id,
    clienteId: c.clienteId || null,
    patente: c.patente,
    nombre: c.nombre,
    telefono: c.telefono || null,
    fechaHora: c.fechaHora,
    duracionMinutos: c.duracionMinutos,
    estado: c.estado,
    notas: c.notas || null,
    origen: c.origen,
    creadoPor: c.creadoPor || null,
    creadoEn: c.creadoEn,
  };
}

/** servicioIds viene resuelto aparte (join con cita_servicios, ver loadAll) porque no vive en la fila de `citas`. */
export function citaFromRow(r: CitaRow, servicioIds: string[]): Cita {
  return {
    id: r.id,
    clienteId: r.clienteId || undefined,
    servicioIds,
    patente: r.patente,
    nombre: r.nombre,
    telefono: r.telefono || undefined,
    fechaHora: r.fechaHora,
    duracionMinutos: r.duracionMinutos,
    estado: r.estado as Cita["estado"],
    notas: r.notas || undefined,
    origen: r.origen as Cita["origen"],
    creadoPor: r.creadoPor || undefined,
    creadoEn: r.creadoEn,
  };
}

/** Estado real en la base de un set de citas, para validar transiciones antes de escribir (ver upsertCitas en @/lib/db). */
export async function getEstadosCitas(ids: string[]): Promise<Map<string, Cita["estado"]>> {
  if (!ids.length) return new Map();
  const rows = await getDb().select({ id: citas.id, estado: citas.estado }).from(citas).where(inArray(citas.id, ids));
  return new Map(rows.map((r) => [r.id, r.estado as Cita["estado"]]));
}

// A diferencia del resto de upsert*, una cita también reemplaza su set de
// servicios ligados (cita_servicios, equivalente a cita_procedimientos en
// ConsultaPro): se borran los vínculos existentes de cada cita tocada y se
// insertan los servicioIds actuales. citaServicios.id es determinístico
// ("citaId:servicioId") para que reintentar el mismo upsert sea idempotente.
export async function upsertCitas(rows: Cita[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    const db = getDb();
    await upsertRows(citas, citas.id, rows.map(citaToRow));
    const citaIds = rows.map((c) => c.id);
    await db.delete(citaServicios).where(inArray(citaServicios.citaId, citaIds));
    const nuevosVinculos = rows.flatMap((c) =>
      c.servicioIds.map((servicioId) => ({ id: `${c.id}:${servicioId}`, citaId: c.id, servicioId }))
    );
    if (nuevosVinculos.length) await db.insert(citaServicios).values(nuevosVinculos);
    return true;
  } catch (error) {
    console.error("Error guardando citas", error);
    return false;
  }
}

export async function deleteCitas(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(citas).where(inArray(citas.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando citas", error);
    return false;
  }
}
