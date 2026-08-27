import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles } from "@/db/schema";
import { borrarCookieFirmada, escribirCookieFirmada, leerCookieFirmada } from "@/lib/auth/cookieFirmada";
import type { Modulo } from "@/types";

// No hay tabla de sesiones ni JWT: la "sesión" es un valor firmado con HMAC
// (payload + firma, ambos en la misma cookie) que el servidor puede validar
// sin ir a la base de datos. Alcanza para lo que necesita esta app —cerrar
// el hueco de Server Actions invocables sin haber iniciado sesión (ver
// tieneSesionValida/tieneModulo, que usan los submódulos de
// @/lib/serverActions)— sin sumar una dependencia nueva. La mecánica de
// firmar/leer la cookie está en @/lib/auth/cookieFirmada, compartida con la
// sesión del Portal Cliente.
//
// Única excepción: `claveVersion` sí se revalida contra la base de datos
// (ver sesionVigente más abajo) para poder invalidar una sesión ya emitida
// cuando la contraseña del perfil cambia, sin esperar a que expire sola.
const COOKIE_NAME = "zplash_sesion";
const DURACION_MS = 12 * 60 * 60 * 1000; // 12h: cubre un turno sin forzar reingresar la clave

interface SesionPayload {
  id: string;
  nombre: string;
  modulos: Modulo[];
  claveVersion: number;
  exp: number;
}

export async function crearSesion(perfil: { id: string; nombre: string; modulos: Modulo[]; claveVersion: number }): Promise<void> {
  const payload: SesionPayload = {
    id: perfil.id,
    nombre: perfil.nombre,
    modulos: perfil.modulos,
    claveVersion: perfil.claveVersion,
    exp: Date.now() + DURACION_MS,
  };
  await escribirCookieFirmada(COOKIE_NAME, payload, DURACION_MS);
}

export async function cerrarSesion(): Promise<void> {
  await borrarCookieFirmada(COOKIE_NAME);
}

export async function leerSesion(): Promise<SesionPayload | null> {
  return leerCookieFirmada<SesionPayload>(COOKIE_NAME);
}

// A diferencia de leerSesion(), esta sí toca la base de datos: confirma que
// la claveVersion firmada en la cookie siga siendo la vigente para ese
// perfil. Si alguien cambió su contraseña después de que se emitió esta
// cookie, claveVersion ya no matchea y la sesión se trata como cerrada.
async function sesionVigente(): Promise<SesionPayload | null> {
  const sesion = await leerSesion();
  if (!sesion) return null;
  const [fila] = await getDb()
    .select({ claveVersion: perfiles.claveVersion })
    .from(perfiles)
    .where(eq(perfiles.id, sesion.id))
    .limit(1);
  if (!fila || fila.claveVersion !== sesion.claveVersion) return null;
  return sesion;
}

export async function tieneSesionValida(): Promise<boolean> {
  return (await sesionVigente()) !== null;
}

export async function tieneModulo(modulo: Modulo): Promise<boolean> {
  const sesion = await sesionVigente();
  return !!sesion && sesion.modulos.includes(modulo);
}

// Expone id + nombre + módulos del perfil de la sesión vigente, para chequeos
// que necesitan algo más que "¿tiene este módulo?" (ver esExentoHorarioOperador
// en @/lib/helpers, usado por insertIngresos en @/lib/serverActions).
export async function sesionActual(): Promise<{ id: string; nombre: string; modulos: Modulo[] } | null> {
  const sesion = await sesionVigente();
  return sesion ? { id: sesion.id, nombre: sesion.nombre, modulos: sesion.modulos } : null;
}
