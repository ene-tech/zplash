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

export function clienteIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "desconocido";
}
