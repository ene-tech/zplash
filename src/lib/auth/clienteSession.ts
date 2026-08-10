import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

// Sesión del Portal Cliente (src/app/cliente), autenticada por código de un
// solo uso enviado por correo (ver src/app/api/cliente/otp) en vez de
// contraseña. Mismo esquema de cookie HMAC firmada que @/lib/session
// (payload + firma en el mismo valor, sin tabla de sesiones), pero con su
// propio nombre de cookie — "zplash_sesion_cliente" ya estaba tomado como
// key de localStorage por la sesión falsa anterior (ver git history de
// @/lib/sesionCliente) y no conviene reusarlo para evitar confusión entre
// ambos mecanismos.
//
// `clienteIds` puede tener más de un id: como clientes.email no es único,
// verificar el código resuelve TODAS las filas de `clientes` que comparten
// ese correo (ver otp/verificar/route.ts), para reproducir "mis vehículos"
// sin necesitar una tabla de "persona" separada.
const COOKIE_NAME = "zplash_cliente_sesion";
const DURACION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días: a diferencia del panel de operadores, acá no hay urgencia de forzar reingreso frecuente

interface SesionClientePayload {
  clienteIds: string[];
  email: string;
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

export async function crearSesionCliente(clienteIds: string[], email: string): Promise<void> {
  const payload: SesionClientePayload = { clienteIds, email, exp: Date.now() + DURACION_MS };
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

export async function cerrarSesionCliente(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function leerSesionCliente(): Promise<SesionClientePayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const separador = raw.lastIndexOf(".");
  if (separador === -1) return null;
  const json = raw.slice(0, separador);
  const firma = raw.slice(separador + 1);
  if (!firmaValida(json, firma)) return null;
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as SesionClientePayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
