import type { NextRequest } from "next/server";

/**
 * Chequeo Origin-vs-Host, igual al que Next.js aplica automáticamente a los
 * Server Actions (ver node_modules/next/dist/docs/.../server-actions.md,
 * "Server Actions... check that the Origin header matches the Host header").
 * Los Route Handlers de auth (/api/perfiles/*) no lo heredan por defecto, así
 * que se aplica acá a mano. El navegador siempre manda Origin en un POST vía
 * fetch, sea o no cross-origin, así que exigirlo no rompe el uso normal.
 */
export function origenValido(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
