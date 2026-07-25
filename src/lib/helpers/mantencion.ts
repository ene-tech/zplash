import type { AlertaMantencion, Ingreso, Maquinaria, PlanStatus, RegistroMantencion } from "@/types";
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

/** Fecha ISO de la última mantención registrada para `maquinaria`, o su
 * `creadoEn` si todavía no tiene ninguna — ancla compartida por
 * proximaMantencionFecha y vehiculosDesdeUltimaMantencion. */
function ultimaMantencionFecha(maquinaria: Pick<Maquinaria, "id" | "creadoEn">, registros: RegistroMantencion[]): string {
  const propios = registros.filter((r) => r.maquinariaId === maquinaria.id);
  return propios.reduce((max, r) => (r.fecha > max ? r.fecha : max), maquinaria.creadoEn);
}

/** Próxima fecha de mantención por calendario (modo "fecha"): última
 * mantención + intervaloDias. A diferencia de vencimientoAnclado (clientes),
 * no se re-avanza en bucle hasta superar "hoy" — si la máquina lleva varios
 * intervalos vencidos sin mantención, se quiere mostrar la fecha vencida
 * original (y hace cuánto), no la próxima fecha futura, para que la urgencia
 * real quede visible en vez de disimulada. Devuelve null si la máquina no usa
 * periodicidad por fecha. */
export function proximaMantencionFecha(
  maquinaria: Pick<Maquinaria, "id" | "creadoEn" | "periodicidadTipo" | "intervaloDias">,
  registros: RegistroMantencion[]
): string | null {
  if (maquinaria.periodicidadTipo !== "fecha" || !maquinaria.intervaloDias) return null;
  const ultima = new Date(ultimaMantencionFecha(maquinaria, registros));
  ultima.setDate(ultima.getDate() + maquinaria.intervaloDias);
  return ultima.toISOString();
}

const DIAS_AVISO_MANTENCION = 7;
// Umbral de aviso en modo "conteo", como % del intervalo en vez de un número
// fijo de lavados (igual que DIAS_AVISO_MANTENCION es fijo para el modo
// "fecha"): un intervalo de 5.000 lavados y uno de 100 no deberían avisar con
// la misma cantidad fija de anticipación, pero sí se les pone un piso mínimo
// para que un intervalo muy chico no quede sin aviso.
const RATIO_AVISO_LAVADOS = 0.1;
const MIN_LAVADOS_AVISO = 10;

export interface MantencionStatus extends PlanStatus {
  proximaFecha?: string;
  conteoActual?: number;
  conteoObjetivo?: number;
  conteoRestante?: number;
}

/** Estado de "próxima mantención" de una máquina, en el modo que tenga
 * configurado (fecha o conteo de lavados) — null si no tiene periodicidad
 * configurada. Mismo criterio ok/warn/bad que planStatus (clientes), para que
 * la ficha de máquina use el mismo lenguaje visual (.status-pill). */
export function mantencionStatus(
  maquinaria: Maquinaria,
  registros: RegistroMantencion[],
  ingresos: Pick<Ingreso, "fecha">[],
  ahora: Date = ahoraEnSantiago()
): MantencionStatus | null {
  if (maquinaria.periodicidadTipo === "fecha" && maquinaria.intervaloDias) {
    const proximaFecha = proximaMantencionFecha(maquinaria, registros)!;
    const hoy = new Date(ahora);
    hoy.setHours(0, 0, 0, 0);
    const prox = new Date(proximaFecha);
    prox.setHours(0, 0, 0, 0);
    const diasRestantes = Math.round((prox.getTime() - hoy.getTime()) / 86400000);
    if (diasRestantes < 0) return { label: "Vencida", cls: "bad", proximaFecha, diasRestantes };
    if (diasRestantes <= DIAS_AVISO_MANTENCION) return { label: "Por vencer", cls: "warn", proximaFecha, diasRestantes };
    return { label: "Al día", cls: "ok", proximaFecha, diasRestantes };
  }
  if (maquinaria.periodicidadTipo === "conteo" && maquinaria.intervaloLavados) {
    const conteoActual = vehiculosDesdeUltimaMantencion(maquinaria, registros, ingresos, ahora.toISOString());
    const conteoObjetivo = maquinaria.intervaloLavados;
    const conteoRestante = conteoObjetivo - conteoActual;
    const umbral = Math.max(MIN_LAVADOS_AVISO, Math.round(conteoObjetivo * RATIO_AVISO_LAVADOS));
    if (conteoRestante <= 0) return { label: "Vencida", cls: "bad", conteoActual, conteoObjetivo, conteoRestante };
    if (conteoRestante <= umbral) return { label: "Por vencer", cls: "warn", conteoActual, conteoObjetivo, conteoRestante };
    return { label: "Al día", cls: "ok", conteoActual, conteoObjetivo, conteoRestante };
  }
  return null;
}

/** Estado de una AlertaMantencion "pendiente" según su fechaObjetivo, con el
 * mismo lenguaje visual ok/warn/bad que mantencionStatus — a diferencia de
 * esa función, esto no depende de que la máquina tenga periodicidad
 * configurada: la alerta es un aviso puntual agendado a mano. */
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
