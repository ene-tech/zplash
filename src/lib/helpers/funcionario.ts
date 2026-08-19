import type {
  MarcaAsistencia,
  TareaTurno,
  TareaTurnoHecha,
  TurnoConTareas,
  TurnoFuncionario,
  TurnoTipo,
} from "@/types";

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

export const TURNO_LABELS: Record<TurnoTipo, string> = {
  apertura: "Apertura",
  cierre: "Cierre",
  normal: "Turno normal",
};

/** Distancia en metros entre dos coordenadas (haversine sobre radio medio
 * terrestre). Se usa para verificar que una marca del libro de asistencia se
 * hizo en el local (ver MarcaAsistencia). */
export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

/** El turno asignado a un perfil para un día ("YYYY-MM-DD"), o null si ese día
 * no trabaja. Ignora las filas desactivadas. */
export function turnoDelDia(
  turnos: TurnoFuncionario[],
  perfilId: string,
  fecha: string
): TurnoFuncionario | null {
  const diaSemana = new Date(`${fecha}T00:00:00`).getDay();
  return turnos.find((t) => t.activo && t.perfilId === perfilId && t.diaSemana === diaSemana) ?? null;
}

/** Las tareas activas de un turno, en su orden de ejecución. */
export function tareasDelTurno(tareas: TareaTurno[], turno: TurnoConTareas): TareaTurno[] {
  return tareas.filter((t) => t.activo && t.turno === turno).sort((a, b) => a.orden - b.orden);
}

/** Id determinista de una tarea cumplida: marcar dos veces la misma tarea del
 * mismo día y turno es el mismo upsert, no dos filas (ver tareas_turno_hechas). */
export function idTareaHecha(fecha: string, turno: TurnoConTareas, tareaId: string): string {
  return `${fecha}|${turno}|${tareaId}`;
}

/** Marcas de un perfil en un día, ordenadas de la más antigua a la más nueva. */
export function marcasDelDia(marcas: MarcaAsistencia[], perfilId: string, fecha: string): MarcaAsistencia[] {
  return marcas
    .filter((m) => m.perfilId === perfilId && m.fecha === fecha)
    .sort((a, b) => (a.marcadoEn < b.marcadoEn ? -1 : 1));
}

/** Qué corresponde marcar ahora: "salida" si la última marca del día fue una
 * entrada, "entrada" en cualquier otro caso (incluido el primer marcaje del
 * día). Deja marcar varios pares por día — hay turnos partidos. */
export function proximaMarca(marcasDelDiaOrdenadas: MarcaAsistencia[]): "entrada" | "salida" {
  const ultima = marcasDelDiaOrdenadas[marcasDelDiaOrdenadas.length - 1];
  return ultima?.tipo === "entrada" ? "salida" : "entrada";
}

/** Minutos trabajados según los pares entrada→salida de un día. Una entrada
 * sin su salida (el funcionario se fue sin marcar, o está trabajando ahora
 * mismo) no aporta minutos: se informa aparte con `abierta`. */
export function minutosTrabajados(marcasDelDiaOrdenadas: MarcaAsistencia[]): { minutos: number; abierta: boolean } {
  let minutos = 0;
  let entrada: string | null = null;
  for (const m of marcasDelDiaOrdenadas) {
    if (m.tipo === "entrada") {
      entrada = m.marcadoEn;
    } else if (entrada) {
      minutos += Math.max(0, Math.round((Date.parse(m.marcadoEn) - Date.parse(entrada)) / 60000));
      entrada = null;
    }
  }
  return { minutos, abierta: entrada !== null };
}

/** "7h 30m" a partir de minutos. */
export function fmtMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Cuántas tareas del checklist de un turno están hechas ese día, para el
 * avance que se muestra en pantalla. */
export function avanceChecklist(
  tareas: TareaTurno[],
  hechas: TareaTurnoHecha[],
  fecha: string,
  turno: TurnoConTareas
): { hechas: number; total: number } {
  const delTurno = tareasDelTurno(tareas, turno);
  const idsHechas = new Set(hechas.filter((h) => h.fecha === fecha && h.turno === turno).map((h) => h.tareaId));
  return { hechas: delTurno.filter((t) => idsHechas.has(t.id)).length, total: delTurno.length };
}
