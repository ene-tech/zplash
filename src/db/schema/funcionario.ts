import { boolean, index, integer, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { perfiles } from "./perfiles";
import { timestamptz } from "./shared";

// Entorno del Funcionario: horario/turno asignado, contrato, libro de
// asistencia con geolocalización y checklist de apertura/cierre. Un perfil
// (ver perfiles.ts) es la persona — acá va todo lo laboral que cuelga de él.

// Horario de trabajo Y función asignada en una sola tabla: una fila por
// perfil y día de la semana. `turno` es la función del día ("apertura" abre el
// local, "cierre" lo cierra, "normal" ni una ni la otra) y es lo que decide
// qué checklist de tareas_turno le toca (ver tareasDelTurno en
// @/lib/helpers/funcionario). Sin fila para un día = ese día no trabaja.
export const turnosFuncionario = pgTable(
  "turnos_funcionario",
  {
    id: text("id").primaryKey(),
    perfilId: text("perfil_id")
      .notNull()
      .references(() => perfiles.id, { onDelete: "cascade" }),
    diaSemana: integer("dia_semana").notNull(), // 0 = domingo … 6 = sábado, igual que Date.getDay()
    turno: text("turno").notNull().default("normal"),
    horaInicio: text("hora_inicio").notNull(), // "HH:MM"
    horaFin: text("hora_fin").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [uniqueIndex("turnos_funcionario_perfil_dia_idx").on(t.perfilId, t.diaSemana)]
);

// Catálogo de tareas obligatorias de apertura y de cierre (ej. "Cortar matriz
// general de agua" al cerrar, "Purgar agua de compresores" al abrir),
// administrable por Gerencia. `orden` es el orden en que se ejecutan en el
// local, no alfabético — la lista es una secuencia, no un set.
export const tareasTurno = pgTable(
  "tareas_turno",
  {
    id: text("id").primaryKey(),
    turno: text("turno").notNull(), // "apertura" | "cierre"
    descripcion: text("descripcion").notNull(),
    orden: integer("orden").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [index("tareas_turno_turno_idx").on(t.turno)]
);

// Una tarea del checklist efectivamente hecha, un día y un turno concretos.
// El id es determinista (`fecha|turno|tareaId`, ver idTareaHecha en
// @/lib/helpers/funcionario): marcar dos veces la misma tarea es el mismo
// upsert, y desmarcarla es borrar esa fila — no hay forma de duplicar el
// cumplimiento de una tarea ni de que dos pestañas abiertas peleen por ella.
// `perfil_id` sin FK a propósito: el registro de quién cerró el local debe
// sobrevivir a que ese perfil se elimine (perfil_nombre queda como copia).
export const tareasTurnoHechas = pgTable(
  "tareas_turno_hechas",
  {
    id: text("id").primaryKey(),
    fecha: text("fecha").notNull(), // YYYY-MM-DD, día de caja (ver diaCaja en @/lib/helpers)
    turno: text("turno").notNull(),
    tareaId: text("tarea_id").notNull(),
    perfilId: text("perfil_id").notNull(),
    perfilNombre: text("perfil_nombre").notNull(),
    completadoEn: timestamptz("completado_en").notNull().defaultNow(),
    notas: text("notas"),
  },
  (t) => [index("tareas_turno_hechas_fecha_idx").on(t.fecha)]
);

// Libro de asistencia: una fila por marca de entrada o salida. La posición
// llega del navegador del funcionario (navigator.geolocation, ver
// AsistenciaTab) y se guarda tal cual la reportó, junto con la distancia al
// local y el veredicto `en_el_local` calculados al marcar (ver
// distanciaMetros / config.localLat) — snapshot y no cálculo en vivo, para
// que mover la ubicación configurada del local no reescriba el historial.
// null en lat/lng = el funcionario no dio permiso de ubicación; la marca se
// registra igual (no se le puede impedir marcar asistencia) pero queda sin
// respaldo de que estaba en el local.
export const marcasAsistencia = pgTable(
  "marcas_asistencia",
  {
    id: text("id").primaryKey(),
    perfilId: text("perfil_id").notNull(),
    perfilNombre: text("perfil_nombre").notNull(),
    fecha: text("fecha").notNull(), // YYYY-MM-DD, día de caja
    tipo: text("tipo").notNull(), // "entrada" | "salida"
    marcadoEn: timestamptz("marcado_en").notNull().defaultNow(),
    lat: numeric("lat", { mode: "number" }),
    lng: numeric("lng", { mode: "number" }),
    precisionM: integer("precision_m"),
    distanciaM: integer("distancia_m"),
    enElLocal: boolean("en_el_local"),
    notas: text("notas"),
  },
  (t) => [index("marcas_asistencia_fecha_idx").on(t.fecha), index("marcas_asistencia_perfil_idx").on(t.perfilId)]
);

// Contrato vigente del funcionario: una fila por perfil (el id ES el
// perfil_id, así la base garantiza un solo contrato por persona). A propósito
// NO guarda sueldo: esta tabla viaja completa al navegador dentro de AppData
// como todo el resto (ver loadCore), y cualquier operador logueado podría
// leerla — la remuneración necesitaría una lectura aparte con chequeo de
// permiso, no está en este alcance.
export const contratosFuncionario = pgTable("contratos_funcionario", {
  id: text("id")
    .primaryKey()
    .references(() => perfiles.id, { onDelete: "cascade" }),
  cargo: text("cargo").notNull(),
  tipoContrato: text("tipo_contrato").notNull(), // "Indefinido" | "Plazo fijo" | "Part-time" | … (texto libre)
  jornadaHorasSemana: integer("jornada_horas_semana"),
  fechaInicio: text("fecha_inicio").notNull(), // YYYY-MM-DD
  fechaTermino: text("fecha_termino"),
  documentoUrl: text("documento_url"),
  notas: text("notas"),
  actualizadoEn: timestamptz("actualizado_en").notNull().defaultNow(),
});
