"use server";

import * as dataAccess from "@/lib/dataAccess";
import { diaCaja, distanciaMetros, idTareaHecha } from "@/lib/helpers";
import { sesionActual, tieneModulo } from "@/lib/session";
import type { ContratoFuncionario, MarcaAsistencia, TareaTurno, TareaTurnoHecha, TurnoFuncionario } from "@/types";

// Horario/turno asignado, catálogo de tareas y contrato son datos que ASIGNA
// quien administra a las personas, no el funcionario sobre sí mismo: van
// gateados con "perfiles" (el mismo módulo que administra los perfiles) y no
// con "funcionario", que es el acceso de solo-lectura + marcaje de cada uno.
export async function upsertTurnosFuncionario(rows: TurnoFuncionario[]): Promise<boolean> {
  if (!(await tieneModulo("perfiles"))) return false;
  return dataAccess.upsertTurnosFuncionario(rows);
}

export async function deleteTurnosFuncionario(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("perfiles"))) return false;
  return dataAccess.deleteTurnosFuncionario(ids);
}

export async function upsertTareasTurno(rows: TareaTurno[]): Promise<boolean> {
  if (!(await tieneModulo("perfiles"))) return false;
  return dataAccess.upsertTareasTurno(rows);
}

export async function deleteTareasTurno(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("perfiles"))) return false;
  return dataAccess.deleteTareasTurno(ids);
}

export async function upsertContratosFuncionario(rows: ContratoFuncionario[]): Promise<boolean> {
  if (!(await tieneModulo("perfiles"))) return false;
  return dataAccess.upsertContratosFuncionario(rows);
}

export async function deleteContratosFuncionario(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("perfiles"))) return false;
  return dataAccess.deleteContratosFuncionario(ids);
}

/**
 * Marcar entrada/salida en el libro de asistencia. Del payload del cliente se
 * respeta SOLO `tipo`, la posición reportada por el navegador y `notas`: la
 * identidad (perfilId/perfilNombre), el instante, el día y el veredicto de
 * "estaba en el local" se recalculan acá.
 *
 * Es a propósito y no paranoia de más: una Server Action es un endpoint POST
 * alcanzable sin pasar por la UI (ver el comentario del barrel), así que sin
 * esto cualquier funcionario logueado podría marcarle la entrada a otro, o
 * fecharla el lunes pasado. La posición sí es la que reporta el navegador —
 * eso no se puede verificar desde el servidor — pero la distancia al local y
 * el veredicto se calculan con la configuración real, no con lo que venga.
 */
export async function insertMarcasAsistencia(rows: MarcaAsistencia[]): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.modulos.includes("funcionario")) return false;
  if (!rows.length) return true;

  const config = await dataAccess.getConfig();
  const ahora = new Date().toISOString();
  const saneadas = rows.map((m) => {
    const distanciaM =
      m.lat != null && m.lng != null && config.localLat != null && config.localLng != null
        ? distanciaMetros(m.lat, m.lng, config.localLat, config.localLng)
        : undefined;
    return {
      ...m,
      perfilId: sesion.id,
      perfilNombre: sesion.nombre,
      tipo: m.tipo === "salida" ? ("salida" as const) : ("entrada" as const),
      marcadoEn: ahora,
      fecha: diaCaja(ahora),
      distanciaM,
      enElLocal: distanciaM == null ? undefined : distanciaM <= config.radioAsistenciaMetros,
    };
  });
  return dataAccess.insertMarcasAsistencia(saneadas);
}

/**
 * Marcar tareas del checklist de apertura/cierre como hechas. Igual que
 * insertMarcasAsistencia: quién la marcó y cuándo los pone el servidor, y la
 * fecha se fuerza al día de hoy (con su id recalculado) para que no se pueda
 * completar a posteriori el checklist de un día ya pasado.
 */
export async function upsertTareasTurnoHechas(rows: TareaTurnoHecha[]): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.modulos.includes("funcionario")) return false;
  if (!rows.length) return true;

  const ahora = new Date().toISOString();
  const fecha = diaCaja(ahora);
  const saneadas = rows.map((h) => ({
    ...h,
    fecha,
    id: idTareaHecha(fecha, h.turno, h.tareaId),
    perfilId: sesion.id,
    perfilNombre: sesion.nombre,
    completadoEn: ahora,
  }));
  return dataAccess.upsertTareasTurnoHechas(saneadas);
}

/** Desmarcar una tarea del checklist (se equivocó de fila). Solo del día de
 * hoy: el id lleva la fecha adentro (ver idTareaHecha), así que un id de otro
 * día simplemente no se borra. */
export async function deleteTareasTurnoHechas(ids: string[]): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.modulos.includes("funcionario")) return false;
  const hoy = diaCaja(new Date().toISOString());
  return dataAccess.deleteTareasTurnoHechas(ids.filter((id) => id.startsWith(`${hoy}|`)));
}
