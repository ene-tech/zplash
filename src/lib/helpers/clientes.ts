import type { Cliente, PlanStatus } from "@/types";
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
