import type { NextRequest } from "next/server";

/**
 * Límite de tasa en memoria (por instancia del proceso) usando ventana
 * deslizante. No es un límite global entre instancias serverless, pero
 * alcanza para frenar abuso/costos en una app de bajo tráfico como esta sin
 * depender de un servicio externo (Redis/Upstash). Si el tráfico crece al
 * punto de correr en múltiples instancias concurrentes, conviene migrar a
 * un límite compartido (ej. Upstash Ratelimit).
 */
const golpes = new Map<string, number[]>();

export function rateLimited(key: string, limite: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const historial = (golpes.get(key) || []).filter((t) => ahora - t < ventanaMs);
  if (historial.length >= limite) {
    golpes.set(key, historial);
    return true;
  }
  historial.push(ahora);
  golpes.set(key, historial);
  return false;
}

/**
 * IP del cliente para armar la key del límite de tasa.
 *
 * `x-real-ip` primero y `x-forwarded-for` solo como respaldo: el proxy de
 * Vercel setea el primero con la IP real de la conexión, mientras que el
 * segundo es una lista a la que el cliente puede ANTEPONER lo que quiera. Al
 * leer `x-forwarded-for.split(",")[0]` como se hacía antes, mandar
 * "X-Forwarded-For: <lo que sea>" daba una key distinta en cada request y
 * todos los límites de la app (login, OTP, consulta de tickets, el costo por
 * lectura de Plate Recognizer) quedaban en la práctica desactivados.
 *
 * Del `x-forwarded-for` de respaldo se toma la ÚLTIMA entrada, no la primera:
 * es la que agrega el proxy más cercano y la única que el cliente no controla.
 */
export function clienteIp(request: NextRequest): string {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const partes = forwardedFor.split(",");
    return partes[partes.length - 1].trim();
  }
  return "desconocido";
}
