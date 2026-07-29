import type { Cliente, ClientePatch, PlanStatus } from "@/types";
import { ahoraEnSantiago } from "./fechas";
import { normPlate } from "./validadores";

export const DIAS_AVISO_VENCIMIENTO = 7;

export function findClient(clientes: Cliente[], plate: string): Cliente | undefined {
  return clientes.find((c) => normPlate(c.patente) === normPlate(plate));
}

/** La carga masiva por Excel deja "Sin nombre" quemado cuando la fila no trae nombre. */
export function esNombreVacio(nombre: string | undefined | null): boolean {
  return !nombre || !nombre.trim() || nombre.trim().toLowerCase() === "sin nombre";
}

export type PlateEstadoCls = "ok" | "warn" | "bad" | "info";

/**
 * Color del texto de la patente según el estado del cliente — variante de
 * planStatus() con un cuarto valor ("info", azul) para distinguir "Sin plan"
 * de "Vencido": ambos comparten cls "bad" en planStatus (mismo tratamiento
 * para lógica de negocio, p.ej. bloquear ingreso), pero visualmente son
 * estados distintos y conviene poder diferenciarlos de un vistazo en listas.
 */
export function plateEstadoCls(c: Pick<Cliente, "vencimiento">): PlateEstadoCls {
  if (!c.vencimiento) return "info";
  return planStatus(c).cls;
}

export function planStatus(c: Pick<Cliente, "vencimiento">): PlanStatus {
  if (!c.vencimiento) return { label: "Sin plan", cls: "bad" };
  // ahoraEnSantiago() en vez de `new Date()`: esta función se llama tanto
  // desde el navegador (hora de Chile) como desde rutas de servidor
  // (/api/pagos/estado, el bot de WhatsApp) que en producción corren en UTC
  // — sin normalizar, un mismo cliente podía verse "Vigente" en la pantalla
  // del operador y "Vencido" en WhatsApp durante varias horas alrededor de
  // la medianoche en Chile (mismo bug que ya se corrigió para el bloqueo
  // horario del módulo Operador, ver dentroDeHorarioOperador).
  const hoy = ahoraEnSantiago();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(c.vencimiento);
  if (venc < hoy) return { label: "Vencido", cls: "bad" };
  const diff = Math.ceil((venc.getTime() - hoy.getTime()) / 86400000);
  if (diff <= DIAS_AVISO_VENCIMIENTO) return { label: "Por vencer", cls: "warn", diasRestantes: diff };
  return { label: "Vigente", cls: "ok" };
}

/** Duración estándar de un ciclo de plan, en días — mismo bloque usado por vencimientoAnclado/inicioPeriodoPlan. */
export const DURACION_PLAN_DIAS = 30;

/**
 * Porcentaje de un ciclo de plan (30 días) que le queda al cliente, para la
 * barra de progreso de la lista de clientes: 100% recién renovado, 0% el día
 * del vencimiento. Se satura en 100 si el vencimiento quedó más lejos que un
 * ciclo completo (p.ej. un plan cargado manualmente a futuro) y en 0 tras
 * vencido. `null` sin plan asociado (mismo caso que planStatus "Sin plan").
 */
export function planProgreso(c: Pick<Cliente, "vencimiento">, ahora: Date = ahoraEnSantiago()): number | null {
  if (!c.vencimiento) return null;
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(c.vencimiento);
  venc.setHours(0, 0, 0, 0);
  const diasRestantes = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
  return Math.max(0, Math.min(100, Math.round((diasRestantes / DURACION_PLAN_DIAS) * 100)));
}

/**
 * Días enteros transcurridos desde que venció el plan (mismo criterio que
 * planStatus: hora de Chile, comparado contra el inicio del día); `null` si
 * el cliente no tiene plan o su plan sigue vigente. Base del eje "hace
 * cuánto se venció" de la promoción de reactivación (ver
 * precioReactivacionVencido en @/lib/helpers/precios).
 */
export function diasVencido(c: Pick<Cliente, "vencimiento">, ahora: Date = ahoraEnSantiago()): number | null {
  if (!c.vencimiento) return null;
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(c.vencimiento);
  venc.setHours(0, 0, 0, 0);
  if (venc >= hoy) return null;
  return Math.round((hoy.getTime() - venc.getTime()) / 86400000);
}

/**
 * Arma el patch a guardar para un cliente ya existente: solo los campos donde
 * `siguiente` difiere de `anterior` (la copia que esta sesión leyó por
 * última vez), más `id`. Sin esto, guardar un cliente reenvía la fila
 * completa tal cual la tiene la sesión en memoria — si esa copia quedó
 * desactualizada (otra sesión guardó un cambio distinto mientras tanto), el
 * upsert de fila completa pisa silenciosamente ese cambio ajeno con el valor
 * viejo que esta sesión nunca supo que había cambiado (ver memoria del caso
 * HERNAN, 2026-07-27). Un alta nueva (sin `anterior`) no tiene nada que
 * diffear: se guarda la fila completa, como siempre.
 */
export function patchDeCliente(anterior: Cliente | undefined, siguiente: Cliente): ClientePatch {
  if (!anterior) return siguiente;
  const patch: ClientePatch = { id: siguiente.id };
  const campos = new Set([...Object.keys(anterior), ...Object.keys(siguiente)]) as Set<keyof Cliente>;
  for (const campo of campos) {
    if (campo === "id") continue;
    if (siguiente[campo] !== anterior[campo]) (patch as Record<string, unknown>)[campo] = siguiente[campo];
  }
  return patch;
}

/**
 * Resuelve si un cambio de patente pendiente (solicitado desde el módulo
 * Clientes o desde Mi Cuenta, ver `patentePendiente`/`patentePendienteDesde`
 * en @/db/schema/clientes) debe aplicarse en esta escritura: solo cuando
 * `vencimiento` avanza a una fecha estrictamente posterior a la que tenía
 * `anterior` en la base — eso es lo que distingue una renovación real (nuevo
 * período) de cualquier otra edición de la ficha (nombre, teléfono, o incluso
 * la propia solicitud de cambio, que no toca vencimiento). Si `nuevo` es un
 * patch parcial (ver patchDeCliente) sin `vencimiento`, nunca cuenta como
 * renovación — correcto, ese patch no está tocando el plan.
 *
 * Si no corresponde aplicar todavía, igual se preservan
 * patentePendiente/patentePendienteDesde de `anterior` en el resultado: así
 * un caller que arma su patch a partir de una copia en memoria desactualizada
 * (sin estos campos, ej. un `cliente` cargado antes de esta feature) nunca
 * borra sin querer una solicitud real al guardar cambios de otro tipo.
 *
 * Se usa desde dataAccess/clientes.ts::upsertClientes (con `anterior` recién
 * leído de la base) y replicado a mano en @/lib/pagos/aplicarPagoAprobado
 * (que no pasa por upsertClientes).
 */
export function resolverPatentePendiente(
  anterior: Cliente | undefined,
  nuevo: ClientePatch
): { fila: ClientePatch; patenteAnterior?: string } {
  if (!anterior?.patentePendiente) return { fila: nuevo };

  const vencAnteriorTime = anterior.vencimiento ? new Date(anterior.vencimiento).getTime() : null;
  const vencNuevoTime = nuevo.vencimiento ? new Date(nuevo.vencimiento).getTime() : null;
  const renovado = vencNuevoTime !== null && (vencAnteriorTime === null || vencNuevoTime > vencAnteriorTime);

  if (!renovado) {
    return { fila: { ...nuevo, patentePendiente: anterior.patentePendiente, patentePendienteDesde: anterior.patentePendienteDesde } };
  }

  return {
    fila: { ...nuevo, patente: anterior.patentePendiente, patentePendiente: null, patentePendienteDesde: null },
    patenteAnterior: anterior.patente,
  };
}

/** 30 days from `desde` (por defecto ahora), as an ISO string. Kept outside component bodies since it is not a pure computation. */
export function vencimientoPorDefectoISO(desde: Date = new Date()): string {
  const d = new Date(desde);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

/**
 * Próximo vencimiento manteniendo el ciclo mensual anclado a la fecha de
 * contratación original (avanza de 30 en 30 días desde ahí), en vez de
 * reiniciar el ciclo desde la fecha en que el operador renueva manualmente
 * un cliente Web cuyo pago automático falló.
 */
export function vencimientoAnclado(fechaContratacion: string | null | undefined): string {
  // Mismo motivo que en planStatus: hora de Chile, no la del entorno donde
  // corre esta función.
  const hoy = ahoraEnSantiago();
  hoy.setHours(0, 0, 0, 0);
  let base = fechaContratacion ? new Date(fechaContratacion) : new Date(hoy);
  if (isNaN(base.getTime())) base = new Date(hoy);
  while (base <= hoy) {
    base.setDate(base.getDate() + 30);
  }
  return base.toISOString();
}

/**
 * Inicio del período de plan vigente hoy, anclado a fechaContratacion en
 * bloques de 30 días (mismo ciclo que vencimientoAnclado) — no mes
 * calendario. P. ej. contratado el 12 de junio, el período vigente el 5 de
 * julio es [12 jun, 11 jul]. Sin fecha de contratación (cliente sin plan
 * asociado a un ciclo), se usa una ventana de los últimos 30 días.
 */
export function inicioPeriodoPlan(fechaContratacion: string | null | undefined, ahora: Date = ahoraEnSantiago()): Date {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  let base = fechaContratacion ? new Date(fechaContratacion) : null;
  if (!base || isNaN(base.getTime())) {
    base = new Date(hoy);
    base.setDate(base.getDate() - 30);
    return base;
  }
  base.setHours(0, 0, 0, 0);
  let siguiente = new Date(base);
  siguiente.setDate(siguiente.getDate() + 30);
  while (siguiente <= hoy) {
    base = siguiente;
    siguiente = new Date(base);
    siguiente.setDate(siguiente.getDate() + 30);
  }
  return base;
}
