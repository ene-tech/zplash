"use server";

import * as dataAccess from "@/lib/dataAccess";
import { esEstadoFinal, esRetrocesoInvalido } from "@/lib/agenda";
import { tieneModulo, tieneSesionValida } from "@/lib/session";
import type { BloqueoAgenda, Cita, HorarioAgenda } from "@/types";

export async function upsertHorariosAgenda(rows: HorarioAgenda[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.upsertHorariosAgenda(rows);
}

export async function deleteHorariosAgenda(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.deleteHorariosAgenda(ids);
}

export async function upsertBloqueosAgenda(rows: BloqueoAgenda[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.upsertBloqueosAgenda(rows);
}

export async function deleteBloqueosAgenda(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.deleteBloqueosAgenda(ids);
}

// A diferencia de lo anterior, las citas en sí se gatean con una sesión
// simple (igual que insertVentas/insertIngresos): las crea cualquier
// operador con acceso a Servicios Adicionales al registrar un vehículo, no
// solo quien administra la Agenda.
//
// El circuito del vehículo (Cita.estado) no debe retroceder ni reabrirse una
// vez en un estado final (ver esRetrocesoInvalido/esEstadoFinal en
// @/lib/agenda) — la UI ya deshabilita esas opciones en los <select> de
// Agenda/Servicios Adicionales, pero como todo Server Action queda invocable
// por POST directo (ver comentario al inicio de src/lib/db/index.ts) y ya
// hubo un bug real de este tipo en otro llamador (registrarIngresoDetailing
// en @/lib/actions), acá se vuelve a comprobar contra el estado real en la
// base antes de escribir, en vez de confiar en el estado que traiga el
// cliente.
export async function upsertCitas(rows: Cita[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  const estadosActuales = await dataAccess.getEstadosCitas(rows.map((r) => r.id));
  const filas = rows.map((r) => {
    const actual = estadosActuales.get(r.id);
    if (!actual) return r;
    if (esEstadoFinal(actual) || esRetrocesoInvalido(actual, r.estado)) return { ...r, estado: actual };
    return r;
  });
  return dataAccess.upsertCitas(filas);
}

export async function deleteCitas(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteCitas(ids);
}
