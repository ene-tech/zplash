export type PeriodicidadMantencionTipo = "fecha" | "conteo";

// Máquina/equipo del túnel de lavado (ej. cepillos, secadores, bomba de
// agua) — catálogo administrable desde Libro de Mantención → Máquinas.
export interface Maquinaria {
  id: string;
  nombre: string;
  // Zona/sector del local (ej. "Túnel", "Aspirado") — categoría madre que
  // agrupa las máquinas en el listado y en los selectores.
  zona?: string;
  tipo?: string;
  activo: boolean;
  // Ver comentario en @/db/schema/mantencion — solo uno de los dos intervalos
  // aplica según periodicidadTipo; ambos undefined = sin periodicidad.
  periodicidadTipo?: PeriodicidadMantencionTipo;
  intervaloDias?: number;
  intervaloLavados?: number;
  creadoEn: string;
  creadoPor?: string;
}

// Tarea de mantención que requiere una Maquinaria, con sus repuestos y su
// propia periodicidad — la planilla de la ficha de máquina. Ver comentario en
// @/db/schema/mantencion. avisoDias/avisoLavados = con cuánta anticipación
// avisar para alcanzar a comprar repuestos.
export interface PlanMantencion {
  id: string;
  maquinariaId: string;
  descripcion: string;
  repuestos?: string;
  periodicidadTipo: PeriodicidadMantencionTipo;
  intervaloDias?: number;
  intervaloLavados?: number;
  avisoDias?: number;
  avisoLavados?: number;
  // Arranque de la ficha con la máquina ya en funcionamiento: última vez que
  // se hizo antes del sistema y lavados ya acumulados desde entonces. Se
  // ignoran apenas existe un RegistroMantencion de esta tarea.
  ultimaVezEn?: string;
  lavadosPrevios?: number;
  activo: boolean;
  creadoEn: string;
  creadoPor?: string;
}

// Registro de una mantención realizada a una Maquinaria. `vehiculosDesdeUltima`
// se calcula al guardar (ver vehiculosDesdeUltimaMantencion en
// @/lib/helpers/mantencion) contando los Ingreso con fecha entre la mantención
// anterior de esta misma máquina (o Maquinaria.creadoEn si es la primera) y
// `fecha` — así queda registrado cuántos vehículos pasaron por el túnel desde
// el mantenimiento anterior, para decidir el siguiente por desgaste de uso y
// no solo por calendario.
export interface RegistroMantencion {
  id: string;
  maquinariaId: string;
  // Tarea del plan que cumple este registro (null = mantención suelta).
  planId?: string;
  fecha: string;
  descripcion: string;
  responsable?: string;
  costo?: number;
  vehiculosDesdeUltima: number;
  notas?: string;
  creadoPor?: string;
}

export type AlertaMantencionEstado = "pendiente" | "completada" | "cancelada";

// Aviso puntual de una mantención futura agendada a mano para una Maquinaria
// (ej. "aseo general del aire acondicionado" con fechaObjetivo en 8 meses) —
// a diferencia de periodicidadTipo/intervaloDias (regla recurrente calculada
// desde la última mantención), esto no depende de tener periodicidad
// configurada y no se recalcula solo. Al marcar la alerta como realizada se
// crea un RegistroMantencion y se enlaza vía registroMantencionId, dejando la
// bitácora completa: lo agendado y lo efectivamente hecho.
export interface AlertaMantencion {
  id: string;
  maquinariaId: string;
  descripcion: string;
  fechaObjetivo: string;
  estado: AlertaMantencionEstado;
  notas?: string;
  creadoEn: string;
  creadoPor?: string;
  completadoEn?: string;
  registroMantencionId?: string;
}
