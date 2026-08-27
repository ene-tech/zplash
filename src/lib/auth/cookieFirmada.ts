import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

// Mecánica compartida por las dos sesiones de la app: la del panel de
// operadores (@/lib/session) y la del Portal Cliente (@/lib/auth/clienteSession).
// Las dos guardan "payload.firma" en una sola cookie httpOnly, sin tabla de
// sesiones ni JWT — antes cada una traía su propia copia idéntica de
// secreto()/firmar()/firmaValida() y del objeto de opciones de la cookie, que
// es exactamente donde no conviene que dos copias se separen con el tiempo.
//
// Lo que NO vive acá y sigue siendo de cada una: qué se guarda en el payload,
// cuánto dura y qué validaciones extra corren al leerla (la del panel además
// revalida claveVersion contra la base, ver sesionVigente).

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
  // El largo se compara antes porque timingSafeEqual tira si difieren; no
  // filtra nada útil (el largo de una firma base64url de sha256 es fijo).
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

/** Serializa el payload, lo firma y lo deja en la cookie `nombre`. */
export async function escribirCookieFirmada(nombre: string, payload: unknown, duracionMs: number): Promise<void> {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(nombre, `${json}.${firmar(json)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: duracionMs / 1000,
  });
}

export async function borrarCookieFirmada(nombre: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(nombre);
}

/**
 * Devuelve el payload de la cookie `nombre` si la firma es válida y `exp`
 * todavía no pasó; null en cualquier otro caso (sin cookie, firma que no
 * cuadra, JSON corrupto, vencida).
 */
export async function leerCookieFirmada<T extends { exp: number }>(nombre: string): Promise<T | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(nombre)?.value;
  if (!raw) return null;
  // lastIndexOf y no split("."): el payload es base64url, que no usa el punto,
  // pero apoyarse en eso haría que un cambio de codificación rompiera en
  // silencio en vez de fallar la firma.
  const separador = raw.lastIndexOf(".");
  if (separador === -1) return null;
  const json = raw.slice(0, separador);
  const firma = raw.slice(separador + 1);
  if (!firmaValida(json, firma)) return null;
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as T;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
