"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneSesionValida } from "@/lib/session";
import type { AppData, PerfilPublico } from "@/types";

// Toda función exportada de este archivo es un endpoint POST invocable desde
// afuera sin pasar por la UI (ver el comentario de @/lib/serverActions), y el
// id de la acción viaja en el bundle público porque AppContext —un componente
// "use client"— las importa. El chequeo Origin/Host que Next.js aplica solo
// frena a un navegador en otro origen, no a un curl que manda el Origin que
// quiera. Por eso todo lo que devuelva datos de negocio exige sesión acá.

/**
 * Lo ÚNICO que se puede pedir sin haber iniciado sesión: id/nombre/modulos/
 * icono de los perfiles, que es lo que LoginScreen necesita para pintar el
 * selector "¿Quién eres?". Nunca incluye la clave.
 *
 * Antes esta necesidad era la excusa por la que loadCore() entera viajaba sin
 * chequeo — y con ella `clientes` (nombre/email/teléfono/RUT/dirección de
 * todos), la cartola bancaria, la contabilidad completa y los contratos del
 * personal, para cualquiera que hiciera un POST con el id de la acción.
 */
export async function loadPerfilesLogin(): Promise<PerfilPublico[]> {
  return dataAccess.loadPerfilesLogin();
}

export async function loadCore(): Promise<dataAccess.AppDataCore> {
  if (!(await tieneSesionValida())) throw new Error("Sin sesión");
  return dataAccess.loadCore();
}

export async function loadHistorial(): Promise<dataAccess.AppDataHistorial> {
  if (!(await tieneSesionValida())) throw new Error("Sin sesión");
  return dataAccess.loadHistorial();
}

export async function loadAll(): Promise<AppData> {
  if (!(await tieneSesionValida())) throw new Error("Sin sesión");
  return dataAccess.loadAll();
}

// Sin chequeo a propósito: no devuelve datos, solo si la base responde —
// AppContext la llama antes del login para poder mostrar "sin conexión" en la
// pantalla de acceso en vez de un selector de perfiles vacío.
export async function waitForStorage(): Promise<boolean> {
  return dataAccess.waitForStorage();
}
