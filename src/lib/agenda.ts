import type { BloqueoAgenda, Cita, HorarioAgenda } from "@/types";

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
