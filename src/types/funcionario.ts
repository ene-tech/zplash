// Entorno del Funcionario: lo laboral que cuelga de un perfil (ver
// PerfilPublico en ./perfiles) — turno/horario, contrato, libro de asistencia
// y checklist de apertura/cierre. Ver src/db/schema/funcionario.ts.

/** Función del día: "apertura" abre el local, "cierre" lo cierra, "normal" ni
 * una ni la otra. Es lo que decide qué checklist de tareas le toca. */
export type TurnoTipo = "apertura" | "cierre" | "normal";

/** Los dos turnos que tienen checklist propio (ver TareaTurno). */
export type TurnoConTareas = Exclude<TurnoTipo, "normal">;

/** Las dos zonas del local: se abren y se cierran por separado, cada una con
 * su encargado y su checklist propio. De ahí que haya cuatro checklists
 * (turno × zona), no dos. Lo asigna el configurador de Apertura y Cierre. */
export type ZonaTurno = "prelavado" | "aspirados";

/** Un tramo del horario semanal de un funcionario: qué día trabaja, en qué
 * horario y con qué función. No tener fila para un día = ese día no trabaja;
 * dos filas el mismo día = turno partido, con la colación en el hueco. */
export interface TurnoFuncionario {
  id: string;
  perfilId: string;
  diaSemana: number; // 0 = domingo … 6 = sábado, igual que Date.getDay()
  turno: TurnoTipo;
  /** Zona a cargo ese día; null = trabaja sin ser encargado de ninguna. */
  zona?: ZonaTurno | null;
  horaInicio: string; // "HH:MM"
  horaFin: string;
  activo: boolean;
}

/** El tope horario de un operador: los días en que APLICA y la ventana dentro
 * de la que puede trabajar esos días (los demás días trabaja sin tope). El id
 * ES el id del perfil (una regla por persona) y no tener regla es no tener
 * tope. Ver motivoFueraDeRegla. */
export interface ReglaOperador {
  id: string;
  /** Días en que aplica el tope, 0 = domingo … 6 = sábado. */
  dias: number[];
  horaDesde: string; // "HH:MM"
  horaHasta: string;
  notas?: string;
  /** Combos turno|zona (ver claveTurnoZona) que NO puede tomar: "cierre|aspirados".
   * Vacío = puede abrir y cerrar cualquier sector. */
  vetados?: string[];
  /** Ubicación de trabajo: la única zona del local en que presta servicio. No
   * se le asigna ningún turno de la otra —ni de encargado ni normal—, ningún
   * día y a ninguna hora. Ausente = trabaja en todo el local. */
  zonaFija?: ZonaTurno;
}

/** Cuánta gente necesita el local en una franja horaria de ciertos días: "los
 * sábados de 12:00 a 16:00, 4 operadores". Es el requerimiento, no el horario:
 * el creador de horario lo tiene que satisfacer (ver proponerHorario) y la
 * pantalla avisa cuando la semana asignada se queda corta (ver avisosDotacion).
 * Dos franjas que se pisan no se suman: cada una pide "al menos N". */
export interface TramoDotacion {
  id: string;
  /** Días que cubre, 0 = domingo … 6 = sábado. */
  dias: number[];
  desde: string; // "HH:MM"
  hasta: string;
  cantidad: number;
}

/** Una ventana en la que un part time puede prestar servicio: los días y el
 * horario que declaró tener disponible ("sábados y domingos de 10:00 a
 * 14:00"). Es disponibilidad, no turno asignado: lo que efectivamente viene a
 * cubrir es la planilla (ver TramoPartTime). */
export interface DisponibilidadPartTime {
  id: string;
  /** Días que cubre, 0 = domingo … 6 = sábado. */
  dias: number[];
  desde: string; // "HH:MM"
  hasta: string;
}

/** Ficha de una persona que cubre turnos part time. NO es un perfil del
 * sistema (no entra a la app, no tiene módulos ni checklist a cargo): es
 * refuerzo de dotación en los peaks y los fines de semana. `horarios` es
 * cuándo podría venir; la planilla dice cuándo viene. */
export interface PartTime {
  id: string;
  nombre: string;
  telefono?: string;
  notas?: string;
  horarios: DisponibilidadPartTime[];
  activo: boolean;
}

/** Un tramo de la planilla part time: quién viene, qué días y en qué horario.
 * Es oferta de dotación —la contracara de TramoDotacion, que es la demanda— y
 * el creador de horario la descuenta antes de mandar a un funcionario de
 * planta a cubrir un peak (ver proponerHorario). Se repite todas las semanas,
 * igual que el horario del equipo. */
export interface TramoPartTime {
  id: string;
  partTimeId: string;
  /** Días que cubre, 0 = domingo … 6 = sábado. */
  dias: number[];
  desde: string; // "HH:MM"
  hasta: string;
}

/** Tarea obligatoria de un checklist (ej. "Cortar matriz general de agua" al
 * cerrar aspirados). Turno y zona juntos son el checklist al que pertenece.
 * `orden` es la secuencia en que se ejecutan en el local. */
export interface TareaTurno {
  id: string;
  turno: TurnoConTareas;
  zona: ZonaTurno;
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
  zona: ZonaTurno;
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
