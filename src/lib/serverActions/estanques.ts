"use server";

import * as dataAccess from "@/lib/dataAccess";
import { sesionActual, tieneModulo } from "@/lib/session";
import type { Estanque, EstanqueConLectura, Valvula } from "@/types";

export async function cargarEstanques(): Promise<{ estanques: EstanqueConLectura[]; valvulas: Valvula[] }> {
  if (!(await tieneModulo("estanques"))) return { estanques: [], valvulas: [] };
  return dataAccess.cargarEstanques();
}

export async function upsertEstanques(rows: Estanque[]): Promise<boolean> {
  if (!(await tieneModulo("estanques"))) return false;
  return dataAccess.upsertEstanques(rows);
}

export async function deleteEstanques(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("estanques"))) return false;
  return dataAccess.deleteEstanques(ids);
}

export async function crearValvula(v: Valvula): Promise<boolean> {
  if (!(await tieneModulo("estanques"))) return false;
  return dataAccess.crearValvula(v);
}

// Separado de la creación y acotado a los campos de configuración: editar el
// nombre de una válvula no puede terminar escribiendo su estado de apertura
// (ver actualizarValvula en @/lib/dataAccess).
export async function actualizarValvula(
  id: string,
  campos: { nombre?: string; estanqueId?: string; activo?: boolean }
): Promise<boolean> {
  if (!(await tieneModulo("estanques"))) return false;
  return dataAccess.actualizarValvula(id, campos);
}

export async function deleteValvulas(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("estanques"))) return false;
  return dataAccess.deleteValvulas(ids);
}

// Quién abrió la llave queda registrado desde la sesión del servidor y no
// desde un parámetro: abrir agua es una acción con consecuencia física y el
// nombre no lo debe poder elegir el que llama.
export async function setValvula(id: string, abierta: boolean): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion?.modulos.includes("estanques")) return false;
  return dataAccess.setValvula(id, abierta, sesion.nombre);
}
