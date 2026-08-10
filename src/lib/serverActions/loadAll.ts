"use server";

import * as dataAccess from "@/lib/dataAccess";
import type { AppData } from "@/types";

// Se consultan antes de haber iniciado sesión (pantalla de login: necesita
// nombres/módulos de perfiles para mostrar el selector) — sin chequeo de
// sesión a propósito. Son de solo lectura y nunca incluyen la clave.
//
// Separadas en dos Server Actions (en vez de una sola loadAll()) para que
// AppContext pueda pintar la primera pantalla apenas llega loadCore() sin
// esperar loadHistorial(), que trae las tres tablas que crecen para siempre
// (ventas/ingresos/movimientosContables) — ver dataAccess/loadAll.ts.
export async function loadCore(): Promise<dataAccess.AppDataCore> {
  return dataAccess.loadCore();
}

export async function loadHistorial(): Promise<dataAccess.AppDataHistorial> {
  return dataAccess.loadHistorial();
}

export async function loadAll(): Promise<AppData> {
  return dataAccess.loadAll();
}

export async function waitForStorage(): Promise<boolean> {
  return dataAccess.waitForStorage();
}
