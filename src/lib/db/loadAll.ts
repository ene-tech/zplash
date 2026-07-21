"use server";

import * as dataAccess from "@/lib/dataAccess";
import type { AppData } from "@/types";

// Se consulta antes de haber iniciado sesión (pantalla de login: necesita
// nombres/módulos de perfiles para mostrar el selector) — sin chequeo de
// sesión a propósito. Es de solo lectura y nunca incluye la clave.
export async function loadAll(): Promise<AppData> {
  return dataAccess.loadAll();
}

export async function waitForStorage(): Promise<boolean> {
  return dataAccess.waitForStorage();
}
