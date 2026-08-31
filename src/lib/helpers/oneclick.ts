/** Estados de `suscripciones_oneclick` en que la patente tiene una tarjeta de
 * verdad guardada: "activa" cobra sola y "suspendida" sigue inscrita en
 * Transbank aunque el cron la saltee. Los "pendiente*" son inscripciones a
 * medio camino y "cancelada" ya no existe del lado de Transbank. */
export function tieneTarjetaViva(estado: string | null | undefined): boolean {
  return estado === "activa" || estado === "suspendida";
}

/**
 * Autos a los que "Usar en mis otros autos" le va a copiar la tarjeta de
 * `origen` (ver compartirTarjetaOneclick): los de la cuenta que no son el
 * origen y que todavía no tienen tarjeta propia viva.
 *
 * Nunca pisa una tarjeta existente a propósito: cambiarle el medio de pago a
 * un auto que ya tiene el suyo es inscribir de nuevo, no heredar el de otro.
 * Lo usan el servidor y la UI (para no ofrecer el botón cuando no hay a quién
 * copiarla), así que la regla vive una sola vez.
 */
export function patentesQueRecibenTarjeta(origen: string, misPatentes: string[], conTarjetaViva: string[]): string[] {
  return misPatentes.filter((p) => p !== origen && !conTarjetaViva.includes(p));
}
