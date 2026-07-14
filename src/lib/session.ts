import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles } from "@/db/schema";
import type { Modulo } from "@/types";

// No hay tabla de sesiones ni JWT: la "sesión" es un valor firmado con HMAC
// (payload + firma, ambos en la misma cookie) que el servidor puede validar
// sin ir a la base de datos. Alcanza para lo que necesita esta app —cerrar
// el hueco de Server Actions invocables sin haber iniciado sesión (ver
// exigirSesion/exigirModulo en @/lib/db)— sin sumar una dependencia nueva.
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

function secreto(): string {
  const valor = process.env.SESSION_SECRET;
  if (!valor) throw new Error("Falta SESSION_SECRET en las variables de entorno");
  return valor;
}

function firmar(payload: string): string {
  return crypto.createHmac("sha256", secreto()).update(payload).digest("base64url");
}

function firmaValida(payload: string, firma: string): boolean {
  const esperada = Buffer.from(firmar(payload));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

export async function crearSesion(perfil: { id: string; nombre: string; modulos: Modulo[]; claveVersion: number }): Promise<void> {
  const payload: SesionPayload = {
    id: perfil.id,
    nombre: perfil.nombre,
    modulos: perfil.modulos,
    claveVersion: perfil.claveVersion,
    exp: Date.now() + DURACION_MS,
  };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${json}.${firmar(json)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_MS / 1000,
  });
}

export async function cerrarSesion(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function leerSesion(): Promise<SesionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const separador = raw.lastIndexOf(".");
  if (separador === -1) return null;
  const json = raw.slice(0, separador);
  const firma = raw.slice(separador + 1);
  if (!firmaValida(json, firma)) return null;
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as SesionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
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
