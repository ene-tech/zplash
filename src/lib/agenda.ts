import type { BloqueoAgenda, Cita, HorarioAgenda } from "@/types";

// Circuito interno del vehículo, en el orden en que normalmente ocurre;
// "no_asistio"/"cancelada" son salidas fuera de ese camino feliz. Compartido
// entre la tabla "Citas del día" de la Agenda y la columna Status del log de
// Servicios registrados: ambas muestran/editan el mismo Cita.estado.
export const ESTADOS_CITA: { valor: Cita["estado"]; label: string }[] = [
  { valor: "agendado", label: "Agendado" },
  { valor: "recibido", label: "Recibido" },
  { valor: "en_limpieza", label: "En Limpieza" },
  { valor: "listo_entrega", label: "Listo para Entrega" },
  { valor: "retirado", label: "Retirado" },
  { valor: "no_asistio", label: "No asistió" },
  { valor: "cancelada", label: "Cancelada" },
];

// Estados que cierran el circuito de un vehículo (ya se fue, o la cita no
// llegó a completarse): una vez ahí, el status queda bloqueado — corregir un
// error implica crear una cita nueva, no reabrir esta.
const ESTADOS_FINALES: Cita["estado"][] = ["retirado", "no_asistio", "cancelada"];

export function esEstadoFinal(estado: Cita["estado"]): boolean {
  return ESTADOS_FINALES.includes(estado);
}

// Orden del circuito antes de "retirado": no se puede retroceder a un paso
// anterior (p. ej. de "en_limpieza" a "recibido") aunque el estado actual no
// sea final. "retirado"/"no_asistio"/"cancelada" ya están cubiertos por
// esEstadoFinal, así que no forman parte de esta secuencia.
const ORDEN_ESTADOS_PROCESO: Cita["estado"][] = ["agendado", "recibido", "en_limpieza", "listo_entrega"];

export function esRetrocesoInvalido(estadoActual: Cita["estado"], estadoDestino: Cita["estado"]): boolean {
  const idxActual = ORDEN_ESTADOS_PROCESO.indexOf(estadoActual);
  const idxDestino = ORDEN_ESTADOS_PROCESO.indexOf(estadoDestino);
  if (idxActual === -1 || idxDestino === -1) return false;
  return idxDestino < idxActual;
}

// Estados en los que el vehículo ya está físicamente en el local: antes de
// "recibido" (o sea "agendado") todavía no ha llegado, así que no se le
// puede dar ingreso al túnel por un Lavado Completo Detailing vendido de
// antemano (ver registrarIngresoDetailing en lib/actions.ts, único llamador
// que depende de este chequeo vía citaDetailingPendiente en OperadorResult.tsx).
const ESTADOS_INGRESO_TUNEL_DETAILING: Cita["estado"][] = ["recibido", "en_limpieza", "listo_entrega"];

export function puedeIngresarTunelDetailing(estado: Cita["estado"]): boolean {
  return ESTADOS_INGRESO_TUNEL_DETAILING.includes(estado);
}

function minutosDesdeMedianoche(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 0=domingo … 6=sábado, calculado sin desfase de timezone sobre una fecha "YYYY-MM-DD". */
export function diaSemanaDe(fecha: string): number {
  return new Date(`${fecha}T00:00:00`).getDay();
}

export function seSuperponen(aInicio: number, aFin: number, bInicio: number, bFin: number): boolean {
  return aInicio < bFin && aFin > bInicio;
}

/**
 * Valida una cita propuesta (fecha + hora + duración) contra el horario
 * semanal, los bloqueos puntuales y las citas ya existentes ese día
 * (capacidad 1: un lavadero no puede tener dos citas superpuestas).
 * Devuelve un mensaje de error, o null si el horario está disponible —
 * mismo criterio que validarDisponibilidad() en la Agenda de ConsultaPro,
 * adaptado a un horario único para todo el negocio (no por profesional) y
 * con el chequeo de choque contra otras citas que allá no hacía falta.
 * `citaIdExcluir` permite validar al editar una cita ya guardada sin que
 * choque consigo misma.
 */
export function validarDisponibilidad(
  fecha: string,
  hora: string,
  duracionMinutos: number,
  horarios: HorarioAgenda[],
  bloqueos: BloqueoAgenda[],
  citasDelDia: Cita[],
  citaIdExcluir?: string
): string | null {
  const diaSemana = diaSemanaDe(fecha);
  const inicio = minutosDesdeMedianoche(hora);
  const fin = inicio + duracionMinutos;

  const horariosDelDia = horarios.filter((h) => h.diaSemana === diaSemana);
  const dentroDeHorario = horariosDelDia.some(
    (h) => minutosDesdeMedianoche(h.horaInicio) <= inicio && minutosDesdeMedianoche(h.horaFin) >= fin
  );
  if (!dentroDeHorario) return "Ese horario está fuera del horario de atención.";

  const bloqueado = bloqueos.some((b) => {
    if (b.fecha !== fecha) return false;
    if (b.todoElDia) return true;
    if (!b.horaInicio || !b.horaFin) return false;
    return seSuperponen(inicio, fin, minutosDesdeMedianoche(b.horaInicio), minutosDesdeMedianoche(b.horaFin));
  });
  if (bloqueado) return "Ese horario está bloqueado.";

  const chocaConCita = citasDelDia.some((c) => {
    if (c.id === citaIdExcluir || c.estado === "cancelada") return false;
    const inicioCita = new Date(c.fechaHora);
    const inicioCitaMin = inicioCita.getHours() * 60 + inicioCita.getMinutes();
    return seSuperponen(inicio, fin, inicioCitaMin, inicioCitaMin + c.duracionMinutos);
  });
  if (chocaConCita) return "Ya hay una cita agendada en ese horario.";

  return null;
}
