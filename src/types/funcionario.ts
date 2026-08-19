// Entorno del Funcionario: lo laboral que cuelga de un perfil (ver
// PerfilPublico en ./perfiles) — turno/horario, contrato, libro de asistencia
// y checklist de apertura/cierre. Ver src/db/schema/funcionario.ts.

/** Función del día: "apertura" abre el local, "cierre" lo cierra, "normal" ni
 * una ni la otra. Es lo que decide qué checklist de tareas le toca. */
export type TurnoTipo = "apertura" | "cierre" | "normal";

/** Los dos turnos que tienen checklist propio (ver TareaTurno). */
export type TurnoConTareas = Exclude<TurnoTipo, "normal">;

/** Una fila del horario semanal de un funcionario: qué día trabaja, en qué
 * horario y con qué función. No tener fila para un día = ese día no trabaja. */
export interface TurnoFuncionario {
  id: string;
  perfilId: string;
  diaSemana: number; // 0 = domingo … 6 = sábado, igual que Date.getDay()
  turno: TurnoTipo;
  horaInicio: string; // "HH:MM"
  horaFin: string;
  activo: boolean;
}

/** Tarea obligatoria de apertura o de cierre (ej. "Cortar matriz general de
 * agua"). `orden` es la secuencia en que se ejecutan en el local. */
export interface TareaTurno {
  id: string;
  turno: TurnoConTareas;
  descripcion: string;
  orden: number;
  activo: boolean;
}

/** Una tarea del checklist marcada como hecha un día y turno concretos. El id
 * es determinista (ver idTareaHecha en @/lib/helpers/funcionario): desmarcar
 * es borrar esta fila, no crear otra. */
export interface TareaTurnoHecha {
  id: string;
  fecha: string; // YYYY-MM-DD (día de caja)
  turno: TurnoConTareas;
  tareaId: string;
  perfilId: string;
  perfilNombre: string;
  completadoEn: string; // ISO
  notas?: string;
}

/** Marca de entrada o salida del libro de asistencia. lat/lng/precisionM
 * vienen del navegador; distanciaM y enElLocal se calculan al marcar contra la
 * ubicación configurada del local y quedan como snapshot. Sin permiso de
 * ubicación, los cuatro quedan undefined y la marca se registra igual. */
export interface MarcaAsistencia {
  id: string;
  perfilId: string;
  perfilNombre: string;
  fecha: string; // YYYY-MM-DD (día de caja)
  tipo: "entrada" | "salida";
  marcadoEn: string; // ISO
  lat?: number;
  lng?: number;
  precisionM?: number;
  distanciaM?: number;
  enElLocal?: boolean;
  notas?: string;
}

/** Contrato vigente de un funcionario: `id` ES el id del perfil (uno por
 * persona, garantizado por la PK). Sin remuneración a propósito — ver el
 * comentario de contratos_funcionario en el esquema. */
export interface ContratoFuncionario {
  id: string;
  cargo: string;
  tipoContrato: string;
  jornadaHorasSemana?: number;
  fechaInicio: string; // YYYY-MM-DD
  fechaTermino?: string;
  documentoUrl?: string;
  notas?: string;
  actualizadoEn: string; // ISO
}
