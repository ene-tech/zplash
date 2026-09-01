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

export interface EstadoRenovacion {
  label: string;
  /** Variante de .status-pill; "" = etiqueta neutra sin fondo (no hay .info). */
  cls: "ok" | "warn" | "bad" | "";
}

/**
 * Estado de la renovación automática de un cliente, para la columna
 * "Suscripción" de la base de clientes. `estadoOneclick` es el estado de su
 * fila viva en suscripciones_oneclick (la primera del listado ya ordenado por
 * activa < suspendida < pendiente < cancelada), o undefined si nunca inscribió
 * tarjeta.
 *
 * Quién canceló no se guarda en ninguna columna, pero el estado lo delata:
 * "suspendida" solo la produce el admin (anularSuscripcion desde la ficha y
 * "Suspender" en Admin → Suscripciones), mientras que "cancelada" es la baja
 * de tarjeta en Transbank, que sale de Mi Cuenta ("Eliminar plan" / "Eliminar
 * tarjeta"). La excepción es el botón "Cancelar" de Admin → Suscripciones, que
 * también deja "cancelada" y acá se lee como cancelada por el cliente.
 *
 * WooCommerce solo aporta el caso positivo: renovacionAutoWooDesde ≠ null es
 * evidencia de que la suscripción vieja sigue viva (el webhook lo limpia al
 * cancelarse). suscripcionCanceladaEn NO se usa para el lado negativo porque
 * ese webhook mezcla "cancelled" con "expired": un plan que simplemente venció
 * quedaría rotulado como cancelado por el cliente.
 */
export function estadoRenovacion(
  c: { origen?: "WEB" | "LOCAL"; renovacionAutoWooDesde?: string | null },
  estadoOneclick?: string
): EstadoRenovacion {
  if (estadoOneclick === "activa" || (!estadoOneclick && c.renovacionAutoWooDesde)) return { label: "Renovación automática", cls: "ok" };
  if (estadoOneclick === "suspendida") return { label: "Cancelada desde admin", cls: "warn" };
  if (estadoOneclick === "cancelada") return { label: "Cancelada por cliente", cls: "bad" };
  return { label: `${(c.origen || "LOCAL") === "WEB" ? "Web" : "Local"} sin RA`, cls: "" };
}
