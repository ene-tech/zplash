import {
  deleteContratosFuncionario,
  deleteReglasOperador,
  deleteTareasTurno,
  deleteTareasTurnoHechas,
  deleteTurnosFuncionario,
  insertMarcasAsistencia,
  upsertContratosFuncionario,
  upsertReglasOperador,
  upsertTareasTurno,
  upsertTareasTurnoHechas,
  upsertTurnosFuncionario,
} from "@/lib/serverActions";
import type {
  ContratoFuncionario,
  MarcaAsistencia,
  ReglaOperador,
  TareaTurno,
  TareaTurnoHecha,
  TurnoFuncionario,
} from "@/types";
import { diffPorId, SIN_CAMBIOS, type CommitResult } from "./shared";

export function commitTurnosFuncionario(previous: TurnoFuncionario[], siguientes: TurnoFuncionario[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertTurnosFuncionario(cambiados));
  if (eliminados.length) ops.push(deleteTurnosFuncionario(eliminados));
  return { ops, auditoria: [] };
}

export function commitTareasTurno(previous: TareaTurno[], siguientes: TareaTurno[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertTareasTurno(cambiados));
  if (eliminados.length) ops.push(deleteTareasTurno(eliminados));
  return { ops, auditoria: [] };
}

export function commitTareasTurnoHechas(previous: TareaTurnoHecha[], siguientes: TareaTurnoHecha[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertTareasTurnoHechas(cambiados));
  // Desmarcar una tarea es borrar su fila: el id es determinista (ver
  // idTareaHecha), así que volver a marcarla reescribe la misma fila.
  if (eliminados.length) ops.push(deleteTareasTurnoHechas(eliminados));
  return { ops, auditoria: [] };
}

// Solo inserta: una marca del libro de asistencia no se edita ni se borra
// (no hay delete en la capa de datos), así que el lado "eliminados" del diff
// se ignora a propósito — igual que un cierre de caja, lo marcado queda.
export function commitMarcasAsistencia(previous: MarcaAsistencia[], siguientes: MarcaAsistencia[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados } = diffPorId(previous, siguientes);
  return { ops: cambiados.length ? [insertMarcasAsistencia(cambiados)] : [], auditoria: [] };
}

export function commitReglasOperador(previous: ReglaOperador[], siguientes: ReglaOperador[] | undefined): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertReglasOperador(cambiados));
  if (eliminados.length) ops.push(deleteReglasOperador(eliminados));
  return { ops, auditoria: [] };
}

export function commitContratosFuncionario(
  previous: ContratoFuncionario[],
  siguientes: ContratoFuncionario[] | undefined
): CommitResult {
  if (!siguientes) return SIN_CAMBIOS;
  const { cambiados, eliminados } = diffPorId(previous, siguientes);
  const ops: Promise<boolean>[] = [];
  if (cambiados.length) ops.push(upsertContratosFuncionario(cambiados));
  if (eliminados.length) ops.push(deleteContratosFuncionario(eliminados));
  return { ops, auditoria: [] };
}
