import type { Cliente, Ingreso } from "@/types";
import { inicioPeriodoPlan } from "./clientes";
import { fmtCLP, pasesIncluidos, PLAN_ILIMITADO_LEGACY, PLAN_X5, PRECIO_LAVADO_UNICO } from "./precios";
import { ahoraEnSantiago, fmtFecha, fmtHora, todayStr } from "./fechas";

/** Si el cliente ya registró un ingreso hoy (para limitar a 1 pasada diaria por plan vigente). */
export function yaIngresoHoy(ingresos: Ingreso[], clienteId: string): boolean {
  const hoy = todayStr();
  return ingresos.some((i) => i.clienteId === clienteId && new Date(i.fecha).toDateString() === hoy);
}

export function ultimoIngresoCliente(ingresos: Ingreso[], clienteId: string): Ingreso | undefined {
  return ingresos
    .filter((i) => i.clienteId === clienteId)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
}

const HORAS_VENTANA_GARANTIA = 1;

export type EstadoReingresoPlan = "libre" | "garantia" | "bloqueado" | "sin_pases";

/** Texto legible de horasBloqueoReingresoPlan, ej: 24.5 -> "24:30 horas". */
function fmtHorasBloqueo(horas: number): string {
  const horasEnteras = Math.floor(horas);
  const minutos = Math.round((horas - horasEnteras) * 60);
  if (minutos === 0) return horasEnteras === 1 ? "1 hora" : `${horasEnteras} horas`;
  return `${horasEnteras}:${String(minutos).padStart(2, "0")} horas`;
}

/**
 * Un vehículo con plan solo puede pasar 1 vez cada `horasBloqueo` horas (ver
 * horasBloqueoReingresoPlan en ConfigGlobal, editable en Configuración). La
 * garantía (repasar el mismo lavado sin cobrar de nuevo) solo se puede hacer
 * efectiva hasta 1 hora después del ingreso anterior; pasada esa hora y hasta
 * que se cumpla `horasBloqueo`, el reingreso queda bloqueado (ni garantía ni
 * pasada nueva, salvo pagando un lavado único — ver `precioLavadoUnico`).
 */
export function estadoReingresoPlan(
  ingresos: Ingreso[],
  clienteId: string,
  ahora: Date = new Date(),
  horasBloqueo: number = 24.5
): EstadoReingresoPlan {
  const ultimo = ultimoIngresoCliente(ingresos, clienteId);
  if (!ultimo) return "libre";
  const msDesdeUltimo = ahora.getTime() - new Date(ultimo.fecha).getTime();
  if (msDesdeUltimo >= horasBloqueo * 3600 * 1000) return "libre";
  if (msDesdeUltimo <= HORAS_VENTANA_GARANTIA * 3600 * 1000) return "garantia";
  return "bloqueado";
}

/** Hora a partir de la cual el vehículo vuelve a poder pasar (último ingreso + horasBloqueo). */
export function proximoIngresoPermitido(ingresos: Ingreso[], clienteId: string, horasBloqueo: number = 24.5): Date | undefined {
  const ultimo = ultimoIngresoCliente(ingresos, clienteId);
  if (!ultimo) return undefined;
  return new Date(new Date(ultimo.fecha).getTime() + horasBloqueo * 3600 * 1000);
}

export function mensajeBloqueoReingreso(ingresos: Ingreso[], clienteId: string, horasBloqueo: number = 24.5): string {
  const proximo = proximoIngresoPermitido(ingresos, clienteId, horasBloqueo);
  const hora = proximo ? fmtHora(proximo.toISOString()) : "";
  return `VEHICULO HIZO USO DEL SERVICIO TUNEL HACE MENOS DE ${fmtHorasBloqueo(horasBloqueo).toUpperCase()}. PUEDE REINGRESAR A PARTIR DE LAS ${hora} HRS.`;
}

/**
 * Pasadas que le quedan al cliente dentro de su ciclo de plan vigente.
 * null = sin tope, que es el caso de todos los que contrataron el plan
 * ilimitado antes del X5 (ver pasesIncluidos en ./precios: el nombre del plan
 * guardado en el cliente es la marca) y de los que no tienen plan.
 */
export function pasesRestantes(
  ingresos: Ingreso[],
  cliente: Pick<Cliente, "id" | "plan" | "fechaContratacion">,
  ahora: Date = ahoraEnSantiago()
): number | null {
  const incluidos = pasesIncluidos(cliente.plan);
  if (incluidos === null) return null;
  return Math.max(0, incluidos - visitasPeriodoPlan(ingresos, cliente, ahora));
}

/** Día en que arranca el próximo ciclo del plan (fin del vigente + 1), que es
 * cuando se le reponen las pasadas al cliente con tope. */
export function inicioProximoPeriodoPlan(
  cliente: Pick<Cliente, "fechaContratacion">,
  ahora: Date = ahoraEnSantiago()
): Date {
  const fin = inicioPeriodoPlan(cliente.fechaContratacion, ahora);
  fin.setDate(fin.getDate() + 30);
  return fin;
}

export function mensajeSinPases(
  cliente: Pick<Cliente, "plan" | "fechaContratacion">,
  ahora: Date = ahoraEnSantiago()
): string {
  const incluidos = pasesIncluidos(cliente.plan) ?? 0;
  const proximo = inicioProximoPeriodoPlan(cliente, ahora);
  return `VEHICULO YA USO LAS ${incluidos} PASADAS DE SU ${(cliente.plan || "").toUpperCase()} EN ESTE PERIODO. LE TOCAN ${incluidos} NUEVAS EL ${fmtFecha(proximo.toISOString())}.`;
}

/**
 * Pasadas del período recién cerrado desde las cuales una renovación migra al
 * cliente del plan ilimitado viejo al X5: los que más lavan migran primero,
 * y bajar este número va migrando al resto sin tocar un solo dato (el plan de
 * cada cliente se reescribe solo al renovar, ver planAlRenovar).
 */
export const UMBRAL_MIGRACION_X5 = 6;

/**
 * Plan con el que queda el cliente después de renovar. El ilimitado viejo se
 * respeta mientras el cliente pase menos de UMBRAL_MIGRACION_X5 veces por
 * período; de ahí para arriba, la renovación lo pasa al X5 (y con eso al tope
 * de 5). Contratar de nuevo NO pasa por acá: eso es una venta nueva y siempre
 * es X5 (ver contratarPlan en usePlanActions).
 */
export function planAlRenovar(plan: string | null | undefined, visitasPeriodo: number): string {
  if (plan === PLAN_ILIMITADO_LEGACY && visitasPeriodo >= UMBRAL_MIGRACION_X5) return PLAN_X5;
  return plan || PLAN_X5;
}

/**
 * Cantidad de ingresos del cliente dentro del período de plan vigente (30
 * días anclados a fechaContratacion, ver inicioPeriodoPlan) — no mes
 * calendario ni el total histórico acumulado en `cliente.visitas`.
 */
export function visitasPeriodoPlan(
  ingresos: Ingreso[],
  cliente: Pick<Cliente, "id" | "fechaContratacion">,
  ahora: Date = ahoraEnSantiago()
): number {
  const inicio = inicioPeriodoPlan(cliente.fechaContratacion, ahora);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 30);
  return ingresos.filter((i) => i.clienteId === cliente.id && new Date(i.fecha) >= inicio && new Date(i.fecha) < fin).length;
}

/**
 * Cantidad de ingresos del cliente durante su último período de plan pagado,
 * es decir los 30 días que terminan en `vencimiento` — a diferencia de
 * visitasPeriodoPlan (que usa `ahora` para ubicar el período vigente), acá el
 * cliente ya está vencido y el período relevante es el último que sí pagó,
 * no uno posterior sin pago. Eje "veces" de la promoción de reactivación de
 * plan vencido (ver precioReactivacionVencido en @/lib/helpers/precios).
 */
export function visitasUltimoPeriodoVencido(ingresos: Ingreso[], cliente: Pick<Cliente, "id" | "vencimiento">): number {
  if (!cliente.vencimiento) return 0;
  const fin = new Date(cliente.vencimiento);
  const inicio = new Date(fin);
  inicio.setDate(inicio.getDate() - 30);
  return ingresos.filter((i) => i.clienteId === cliente.id && new Date(i.fecha) >= inicio && new Date(i.fecha) < fin).length;
}

/**
 * Cantidad de ingresos del cliente desde que contrató su plan actual
 * (fechaContratacion), sin acotar al ciclo de 30 días vigente — a diferencia
 * de visitasPeriodoPlan, que solo cuenta el período vigente. Puede abarcar
 * varias renovaciones, ya que fechaContratacion no se actualiza en cada
 * renovación (ver renovarPlan en @/lib/logic).
 */
export function visitasDesdeContratacion(ingresos: Ingreso[], cliente: Pick<Cliente, "id" | "fechaContratacion">): number {
  if (!cliente.fechaContratacion) return 0;
  const inicio = new Date(cliente.fechaContratacion);
  return ingresos.filter((i) => i.clienteId === cliente.id && new Date(i.fecha) >= inicio).length;
}

/** Cantidad de ingresos del cliente en los últimos 30 días — para clientes sin plan, que no tienen fechaContratacion que anclar. */
export function visitasUltimos30Dias(ingresos: Ingreso[], clienteId: string, ahora: Date = ahoraEnSantiago()): number {
  const inicio = new Date(ahora);
  inicio.setDate(inicio.getDate() - 30);
  return ingresos.filter((i) => i.clienteId === clienteId && new Date(i.fecha) >= inicio).length;
}

export function tipoIngreso(i: Ingreso): { label: string; cls: "ok" | "warn" | "bad" } {
  if (i.glosa) return { label: i.glosa, cls: "ok" };
  if (i.viaCupon) return { label: "Cupón", cls: "warn" };
  if (i.esGarantia) return { label: "Garantía", cls: "warn" };
  if (i.planEstadoAlIngreso === "bad") return { label: fmtCLP(PRECIO_LAVADO_UNICO), cls: "bad" };
  return { label: "Ingreso por plan", cls: "ok" };
}
