import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contratosFuncionario,
  marcasAsistencia,
  reglasOperador,
  tareasTurno,
  tareasTurnoHechas,
  turnosFuncionario,
} from "@/db/schema";
import type {
  ContratoFuncionario,
  MarcaAsistencia,
  ReglaOperador,
  TareaTurno,
  TareaTurnoHecha,
  TurnoConTareas,
  TurnoFuncionario,
  TurnoTipo,
  ZonaTurno,
} from "@/types";
import { upsertRows } from "./shared";

type TurnoRow = typeof turnosFuncionario.$inferSelect;
type TareaTurnoRow = typeof tareasTurno.$inferSelect;
type TareaHechaRow = typeof tareasTurnoHechas.$inferSelect;
type MarcaRow = typeof marcasAsistencia.$inferSelect;
type ContratoRow = typeof contratosFuncionario.$inferSelect;
type ReglaOperadorRow = typeof reglasOperador.$inferSelect;

export function turnoFuncionarioFromRow(r: TurnoRow): TurnoFuncionario {
  return {
    id: r.id,
    perfilId: r.perfilId,
    diaSemana: r.diaSemana,
    turno: r.turno as TurnoTipo,
    zona: r.zona as ZonaTurno | null,
    horaInicio: r.horaInicio,
    horaFin: r.horaFin,
    activo: r.activo,
  };
}

export async function upsertTurnosFuncionario(rows: TurnoFuncionario[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(turnosFuncionario, turnosFuncionario.id, rows.map((t) => ({ ...t })));
    return true;
  } catch (error) {
    console.error("Error guardando turnos de funcionario", error);
    return false;
  }
}

export async function deleteTurnosFuncionario(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(turnosFuncionario).where(inArray(turnosFuncionario.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando turnos de funcionario", error);
    return false;
  }
}

export function reglaOperadorFromRow(r: ReglaOperadorRow): ReglaOperador {
  return {
    id: r.id,
    dias: r.dias.split(",").filter(Boolean).map(Number),
    horaDesde: r.horaDesde,
    horaHasta: r.horaHasta,
    vetados: r.vetados?.split(",").filter(Boolean) ?? [],
    zonaFija: (r.zonaFija as ZonaTurno) || undefined,
    notas: r.notas || undefined,
  };
}

export async function upsertReglasOperador(rows: ReglaOperador[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(
      reglasOperador,
      reglasOperador.id,
      rows.map((r) => ({
        ...r,
        dias: r.dias.join(","),
        vetados: r.vetados?.join(",") || null,
        zonaFija: r.zonaFija || null,
        notas: r.notas || null,
      }))
    );
    return true;
  } catch (error) {
    console.error("Error guardando reglas de operador", error);
    return false;
  }
}

export async function deleteReglasOperador(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(reglasOperador).where(inArray(reglasOperador.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando reglas de operador", error);
    return false;
  }
}

export function tareaTurnoFromRow(r: TareaTurnoRow): TareaTurno {
  return {
    id: r.id,
    turno: r.turno as TurnoConTareas,
    zona: r.zona as ZonaTurno,
    descripcion: r.descripcion,
    orden: r.orden,
    activo: r.activo,
  };
}

export async function upsertTareasTurno(rows: TareaTurno[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(tareasTurno, tareasTurno.id, rows.map((t) => ({ ...t })));
    return true;
  } catch (error) {
    console.error("Error guardando tareas de turno", error);
    return false;
  }
}

// Borrar una tarea del catálogo NO borra el historial de cumplimiento
// (tareas_turno_hechas.tarea_id no tiene FK, ver el esquema): el registro de
// "el 12 de marzo se cortó la matriz de agua" tiene que sobrevivir a que la
// tarea se reescriba o se saque de la lista.
export async function deleteTareasTurno(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(tareasTurno).where(inArray(tareasTurno.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando tareas de turno", error);
    return false;
  }
}

export function tareaTurnoHechaFromRow(r: TareaHechaRow): TareaTurnoHecha {
  return {
    id: r.id,
    fecha: r.fecha,
    turno: r.turno as TurnoConTareas,
    zona: r.zona as ZonaTurno,
    tareaId: r.tareaId,
    perfilId: r.perfilId,
    perfilNombre: r.perfilNombre,
    completadoEn: r.completadoEn,
    notas: r.notas || undefined,
  };
}

export async function upsertTareasTurnoHechas(rows: TareaTurnoHecha[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(
      tareasTurnoHechas,
      tareasTurnoHechas.id,
      rows.map((h) => ({ ...h, notas: h.notas || null }))
    );
    return true;
  } catch (error) {
    console.error("Error guardando checklist de turno", error);
    return false;
  }
}

/** Desmarcar una tarea del checklist = borrar su fila (el id es determinista,
 * ver idTareaHecha en @/lib/helpers/funcionario). */
export async function deleteTareasTurnoHechas(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(tareasTurnoHechas).where(inArray(tareasTurnoHechas.id, ids));
    return true;
  } catch (error) {
    console.error("Error desmarcando checklist de turno", error);
    return false;
  }
}

export function marcaAsistenciaFromRow(r: MarcaRow): MarcaAsistencia {
  return {
    id: r.id,
    perfilId: r.perfilId,
    perfilNombre: r.perfilNombre,
    fecha: r.fecha,
    tipo: r.tipo as MarcaAsistencia["tipo"],
    marcadoEn: r.marcadoEn,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    precisionM: r.precisionM ?? undefined,
    distanciaM: r.distanciaM ?? undefined,
    enElLocal: r.enElLocal ?? undefined,
    notas: r.notas || undefined,
  };
}

export async function insertMarcasAsistencia(rows: MarcaAsistencia[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await getDb()
      .insert(marcasAsistencia)
      .values(
        rows.map((m) => ({
          ...m,
          lat: m.lat ?? null,
          lng: m.lng ?? null,
          precisionM: m.precisionM ?? null,
          distanciaM: m.distanciaM ?? null,
          enElLocal: m.enElLocal ?? null,
          notas: m.notas || null,
        }))
      )
      // Insert y no upsert: una marca del libro de asistencia no se edita ni se
      // borra nunca (no hay deleteMarcasAsistencia). Si el mismo id llega dos
      // veces (doble clic, reintento de red), la segunda no hace nada.
      .onConflictDoNothing();
    return true;
  } catch (error) {
    console.error("Error guardando marca de asistencia", error);
    return false;
  }
}

export function contratoFuncionarioFromRow(r: ContratoRow): ContratoFuncionario {
  return {
    id: r.id,
    cargo: r.cargo,
    tipoContrato: r.tipoContrato,
    jornadaHorasSemana: r.jornadaHorasSemana ?? undefined,
    fechaInicio: r.fechaInicio,
    fechaTermino: r.fechaTermino || undefined,
    documentoUrl: r.documentoUrl || undefined,
    notas: r.notas || undefined,
    actualizadoEn: r.actualizadoEn,
  };
}

export async function upsertContratosFuncionario(rows: ContratoFuncionario[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(
      contratosFuncionario,
      contratosFuncionario.id,
      rows.map((c) => ({
        ...c,
        jornadaHorasSemana: c.jornadaHorasSemana ?? null,
        fechaTermino: c.fechaTermino || null,
        documentoUrl: c.documentoUrl || null,
        notas: c.notas || null,
      }))
    );
    return true;
  } catch (error) {
    console.error("Error guardando contratos de funcionario", error);
    return false;
  }
}

export async function deleteContratosFuncionario(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(contratosFuncionario).where(inArray(contratosFuncionario.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando contratos de funcionario", error);
    return false;
  }
}
