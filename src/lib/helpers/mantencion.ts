import type {
  AlertaMantencion,
  Ingreso,
  Maquinaria,
  PlanMantencion,
  PlanStatus,
  RegistroMantencion,
} from "@/types";
import { ahoraEnSantiago } from "./fechas";

/** Cantidad de Ingreso (vehículos que pasaron por el túnel) entre la última
 * mantención registrada para `maquinaria` (o su `creadoEn` si todavía no
 * tiene ninguna) y `hasta` — se calcula al guardar un RegistroMantencion
 * nuevo (ver RegistrosMantencionTab) para dejar registro de cuánto uso
 * acumuló la máquina desde el mantenimiento anterior, sin necesitar un
 * contador aparte que haya que mantener sincronizado a mano. */
export function vehiculosDesdeUltimaMantencion(
  maquinaria: Pick<Maquinaria, "id" | "creadoEn">,
  registros: RegistroMantencion[],
  ingresos: Pick<Ingreso, "fecha">[],
  hasta: string
): number {
  const anteriores = registros.filter((r) => r.maquinariaId === maquinaria.id && r.fecha < hasta);
  const desde = anteriores.reduce((max, r) => (r.fecha > max ? r.fecha : max), maquinaria.creadoEn);
  return ingresos.filter((i) => i.fecha > desde && i.fecha <= hasta).length;
}

// Anticipación por defecto con la que una tarea del plan pasa a "Por vencer",
// cuando la tarea no define la suya (PlanMantencion.avisoDias/avisoLavados).
const DIAS_AVISO_MANTENCION = 7;
// Default de aviso en modo "conteo", como % del intervalo en vez de un número
// fijo de lavados: un intervalo de 5.000 lavados y uno de 100 no deberían
// avisar con la misma cantidad fija de anticipación, pero sí se les pone un
// piso mínimo para que un intervalo muy chico no quede sin aviso.
const RATIO_AVISO_LAVADOS = 0.1;
const MIN_LAVADOS_AVISO = 10;

export interface MantencionStatus extends PlanStatus {
  proximaFecha?: string;
  conteoActual?: number;
  conteoObjetivo?: number;
  conteoRestante?: number;
}

/** Ancla desde la que se cuentan días y lavados: la última vez que se hizo
 * esta tarea según la bitácora (registro con su `planId`) y, mientras no haya
 * ninguna, el arranque declarado al crear la ficha con la máquina ya andando
 * (`ultimaVezEn` / `lavadosPrevios`) o su `creadoEn` si no se declaró nada.
 * `previos` son lavados que ya estaban acumulados y que todavía cuentan. */
function anclaPlan(plan: PlanMantencion, registros: RegistroMantencion[]): { desde: string; previos: number } {
  const propios = registros.filter((r) => r.planId === plan.id);
  if (propios.length) {
    return { desde: propios.reduce((max, r) => (r.fecha > max ? r.fecha : max), plan.creadoEn), previos: 0 };
  }
  return { desde: plan.ultimaVezEn || plan.creadoEn, previos: plan.lavadosPrevios ?? 0 };
}

/** Estado de una tarea del plan de mantención en el modo que tenga (cada X
 * días o cada X lavados), con la anticipación de aviso configurada en la
 * tarea. Mismo criterio ok/warn/bad que planStatus (clientes), para que use
 * el mismo lenguaje visual (.status-pill).
 *
 * A diferencia de proximaMantencionFecha para clientes, la fecha vencida no
 * se re-avanza hasta superar "hoy": si la tarea lleva varios intervalos sin
 * hacerse se quiere ver la fecha vencida original (y hace cuánto), para que
 * la urgencia real quede visible en vez de disimulada.
 *
 * Devuelve null si a la tarea le falta el intervalo de su propio modo (dato
 * viejo o incompleto): sin intervalo no hay nada que calcular. */
export function planMantencionStatus(
  plan: PlanMantencion,
  registros: RegistroMantencion[],
  ingresos: Pick<Ingreso, "fecha">[],
  ahora: Date = ahoraEnSantiago()
): MantencionStatus | null {
  const { desde, previos } = anclaPlan(plan, registros);

  if (plan.periodicidadTipo === "fecha") {
    if (!plan.intervaloDias) return null;
    const prox = new Date(desde);
    prox.setDate(prox.getDate() + plan.intervaloDias);
    const proximaFecha = prox.toISOString();
    const hoy = new Date(ahora);
    hoy.setHours(0, 0, 0, 0);
    prox.setHours(0, 0, 0, 0);
    const diasRestantes = Math.round((prox.getTime() - hoy.getTime()) / 86400000);
    const aviso = plan.avisoDias ?? DIAS_AVISO_MANTENCION;
    if (diasRestantes < 0) return { label: "Vencida", cls: "bad", proximaFecha, diasRestantes };
    if (diasRestantes <= aviso) return { label: "Por vencer", cls: "warn", proximaFecha, diasRestantes };
    return { label: "Al día", cls: "ok", proximaFecha, diasRestantes };
  }

  if (!plan.intervaloLavados) return null;
  const hasta = ahora.toISOString();
  const conteoActual = previos + ingresos.filter((i) => i.fecha > desde && i.fecha <= hasta).length;
  const conteoObjetivo = plan.intervaloLavados;
  const conteoRestante = conteoObjetivo - conteoActual;
  const aviso = plan.avisoLavados ?? Math.max(MIN_LAVADOS_AVISO, Math.round(conteoObjetivo * RATIO_AVISO_LAVADOS));
  if (conteoRestante <= 0) return { label: "Vencida", cls: "bad", conteoActual, conteoObjetivo, conteoRestante };
  if (conteoRestante <= aviso) return { label: "Por vencer", cls: "warn", conteoActual, conteoObjetivo, conteoRestante };
  return { label: "Al día", cls: "ok", conteoActual, conteoObjetivo, conteoRestante };
}

const SEVERIDAD = { bad: 0, warn: 1, ok: 2 } as const;

/** Estado global de una máquina: el de la tarea más urgente de su plan
 * (vencida > por vencer > al día) — null si no tiene tareas activas con
 * periodicidad utilizable. Es el pill que se muestra en el listado de
 * Máquinas. */
export function mantencionStatus(
  maquinaria: Pick<Maquinaria, "id">,
  planes: PlanMantencion[],
  registros: RegistroMantencion[],
  ingresos: Pick<Ingreso, "fecha">[],
  ahora: Date = ahoraEnSantiago()
): MantencionStatus | null {
  const status = planes
    .filter((p) => p.maquinariaId === maquinaria.id && p.activo)
    .map((p) => planMantencionStatus(p, registros, ingresos, ahora))
    .filter((s): s is MantencionStatus => s !== null);
  if (!status.length) return null;
  return status.reduce((peor, s) => (SEVERIDAD[s.cls] < SEVERIDAD[peor.cls] ? s : peor));
}

/** Estado de una AlertaMantencion "pendiente" según su fechaObjetivo, con el
 * mismo lenguaje visual ok/warn/bad que planMantencionStatus — a diferencia
 * de esa función, esto no depende del plan: la alerta es un aviso puntual
 * agendado a mano. */
export function alertaMantencionStatus(
  alerta: Pick<AlertaMantencion, "fechaObjetivo">,
  ahora: Date = ahoraEnSantiago()
): PlanStatus {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(alerta.fechaObjetivo);
  objetivo.setHours(0, 0, 0, 0);
  const diasRestantes = Math.round((objetivo.getTime() - hoy.getTime()) / 86400000);
  if (diasRestantes < 0) return { label: "Vencida", cls: "bad", diasRestantes };
  if (diasRestantes <= DIAS_AVISO_MANTENCION) return { label: "Por vencer", cls: "warn", diasRestantes };
  return { label: "Programada", cls: "ok", diasRestantes };
}

export const SIN_ZONA = "Sin zona";

/** Máquinas agrupadas por su zona (la categoría madre: túnel, aspirado, etc.),
 * ordenadas por zona y por nombre — las que no tienen zona caen en SIN_ZONA y
 * quedan al final. Compartido por el listado de Máquinas y los <optgroup> de
 * los selectores de máquina, para que el orden sea el mismo en todos lados. */
export function maquinariasPorZona(maquinarias: Maquinaria[]): [string, Maquinaria[]][] {
  const grupos = new Map<string, Maquinaria[]>();
  for (const m of maquinarias) {
    const zona = m.zona?.trim() || SIN_ZONA;
    grupos.set(zona, [...(grupos.get(zona) || []), m]);
  }
  return [...grupos.entries()]
    .map(([zona, ms]): [string, Maquinaria[]] => [zona, ms.slice().sort((a, b) => a.nombre.localeCompare(b.nombre))])
    .sort(([a], [b]) => (a === SIN_ZONA ? 1 : b === SIN_ZONA ? -1 : a.localeCompare(b)));
}
