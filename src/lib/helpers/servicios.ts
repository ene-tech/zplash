import type { Servicio } from "@/types";

/** Semilla/fallback de catálogo para cuando la tabla `servicios` está vacía o
 * la migración todavía no corrió — mismo patrón que PERFILES_DEFAULT. Mismos
 * ids/nombres/categorías que el antiguo SERVICIOS_ADICIONALES hardcodeado;
 * duracionMinutos queda en 30 como placeholder editable de inmediato desde
 * la pestaña Agenda (no hay dato real de duración por servicio todavía). */
export const SERVICIOS_DEFAULT: Servicio[] = [
  { id: "detailing-pequeno", categoria: "Lavado Completo Detailing", nombre: "Auto Pequeño", duracionMinutos: 30, activo: true },
  { id: "detailing-mediano", categoria: "Lavado Completo Detailing", nombre: "Mediano / SUV / Pick-up", duracionMinutos: 30, activo: true },
  { id: "detailing-xl", categoria: "Lavado Completo Detailing", nombre: "Auto XL", duracionMinutos: 30, activo: true },
  { id: "tapiz", categoria: "Servicios Adicionales", nombre: "Limpieza de Tapiz (2 Corridas de Asientos)", duracionMinutos: 30, activo: true },
  { id: "alfombra", categoria: "Servicios Adicionales", nombre: "Limpieza de Alfombra", duracionMinutos: 30, activo: true },
  { id: "techo", categoria: "Servicios Adicionales", nombre: "Limpieza de Techo", duracionMinutos: 30, activo: true },
  { id: "motor", categoria: "Servicios Adicionales", nombre: "Lavado de Motor", duracionMinutos: 30, activo: true },
  { id: "chasis", categoria: "Servicios Adicionales", nombre: "Lavado de Chasis", duracionMinutos: 30, activo: true },
  { id: "chasis-grafitado", categoria: "Servicios Adicionales", nombre: "Lavado de Chasis + Grafitado", duracionMinutos: 30, activo: true },
];

/** Categoría del catálogo que implica que el vehículo pasa por el túnel.
 * Compartida entre ServiciosAdicionalesView (venta) y OperadorResult
 * (registro físico del ingreso al túnel, ver GLOSA_SERVICIO_DETAILING). */
export const CATEGORIA_DETAILING = "Lavado Completo Detailing";

/** Glosa de Ingreso para un lavado completo/detailing: la venta se hace en
 * Servicios Adicionales, pero el Ingreso (historial de túnel) recién se crea
 * cuando el operador registra la patente en el módulo Operador al llegar el
 * vehículo — no constituye una venta nueva, solo deja constancia del paso
 * físico por el túnel (ver registrarIngresoDetailing en lib/actions.ts). */
export const GLOSA_SERVICIO_DETAILING = "Servicio de Detailing";

/** Ids del catálogo de "Servicios Adicionales" (fuera de la categoría
 * CATEGORIA_DETAILING) que igual implican que el vehículo pasa por el túnel
 * y por lo tanto también dan derecho a la pasada libre — mismo mecanismo que
 * un Lavado Completo Detailing (ver esServicioTunelLibre,
 * puedeIngresarTunelDetailing en lib/agenda.ts). */
export const IDS_SERVICIOS_TUNEL_LIBRE = ["chasis", "chasis-grafitado"];

/** True si vender este servicio le da al cliente derecho a una pasada libre
 * por el túnel (el operador se lo ofrece al escanear la patente mientras la
 * cita esté Recibido/En Limpieza/Listo para Entrega, ver
 * puedeIngresarTunelDetailing): incluye tanto el propio Lavado Completo
 * Detailing como los add-ons de chasis en IDS_SERVICIOS_TUNEL_LIBRE. */
export function esServicioTunelLibre(servicio: { id: string; categoria?: string }): boolean {
  return servicio.categoria === CATEGORIA_DETAILING || IDS_SERVICIOS_TUNEL_LIBRE.includes(servicio.id);
}
