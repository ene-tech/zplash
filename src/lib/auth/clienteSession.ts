import "server-only";
import { borrarCookieFirmada, escribirCookieFirmada, leerCookieFirmada } from "./cookieFirmada";

// Sesión del Portal Cliente (src/app/cliente), autenticada por código de un
// solo uso enviado por correo (ver src/app/api/cliente/otp) en vez de
// contraseña. Mismo esquema de cookie HMAC firmada que @/lib/session —la
// mecánica compartida vive en ./cookieFirmada— pero con su propio nombre de
// cookie: "zplash_sesion_cliente" ya estaba tomado como key de localStorage
// por la sesión falsa anterior (ver git history de @/lib/sesionCliente) y no
// conviene reusarlo para evitar confusión entre ambos mecanismos.
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

export async function crearSesionCliente(clienteIds: string[], email: string): Promise<void> {
  const payload: SesionClientePayload = { clienteIds, email, exp: Date.now() + DURACION_MS };
  await escribirCookieFirmada(COOKIE_NAME, payload, DURACION_MS);
}

export async function cerrarSesionCliente(): Promise<void> {
  await borrarCookieFirmada(COOKIE_NAME);
}

export async function leerSesionCliente(): Promise<SesionClientePayload | null> {
  return leerCookieFirmada<SesionClientePayload>(COOKIE_NAME);
}
