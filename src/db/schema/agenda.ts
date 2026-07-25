import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { clientes } from "./clientes";
import { servicios } from "./servicios";
import { timestamptz } from "./shared";

// Horario semanal recurrente único para todo el negocio: a diferencia de
// ConsultaPro (horario por profesional), acá no hay "profesional" al que
// asignarle una cita — un lavadero atiende con capacidad de 1 cupo por
// horario. diaSemana: 0=domingo … 6=sábado.
export const horariosAgenda = pgTable("horarios_agenda", {
  id: text("id").primaryKey(),
  diaSemana: integer("dia_semana").notNull(),
  horaInicio: text("hora_inicio").notNull(),
  horaFin: text("hora_fin").notNull(),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Excepciones puntuales al horario habitual: un día completo bloqueado o un
// rango de horas específico dentro de un día.
export const bloqueosAgenda = pgTable("bloqueos_agenda", {
  id: text("id").primaryKey(),
  fecha: text("fecha").notNull(),
  todoElDia: boolean("todo_el_dia").notNull().default(true),
  horaInicio: text("hora_inicio"),
  horaFin: text("hora_fin"),
  motivo: text("motivo"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Cita agendada desde el Registro de Servicio Adicional. duracionMinutos es
// la suma de los servicios ligados en `cita_servicios` (ver esa tabla) —
// snapshot al momento de agendar, así que si luego cambia la duración del
// catálogo la cita ya creada no se recalcula sola. La cita NO genera
// automáticamente una Venta/Ingreso: eso sigue siendo el mismo registro que
// ya hace ServiciosAdicionalesView al guardar.
export const citas = pgTable(
  "citas",
  {
    id: text("id").primaryKey(),
    clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "cascade" }),
    patente: text("patente").notNull(),
    nombre: text("nombre").notNull(),
    telefono: text("telefono"),
    fechaHora: timestamptz("fecha_hora").notNull(),
    duracionMinutos: integer("duracion_minutos").notNull(),
    estado: text("estado").notNull().default("agendado"),
    notas: text("notas"),
    origen: text("origen").notNull().default("interno"),
    creadoPor: text("creado_por"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [index("citas_fecha_hora_idx").on(t.fechaHora), index("citas_cliente_id_idx").on(t.clienteId)]
);

// Servicios ligados a una cita (equivalente a cita_procedimientos en
// ConsultaPro): una cita puede incluir varios servicios del catálogo a la
// vez (ej. Lavado Detailing + Limpieza de Tapiz), en vez de guardar los
// nombres concatenados en un string. onDelete cascade en servicioId sigue el
// mismo criterio que ConsultaPro: los servicios del catálogo casi nunca se
// borran de verdad (se desactivan con `activo`), así que perder el vínculo
// histórico si alguna vez se borra un servicio es un caso aceptado.
export const citaServicios = pgTable("cita_servicios", {
  id: text("id").primaryKey(),
  citaId: text("cita_id")
    .notNull()
    .references(() => citas.id, { onDelete: "cascade" }),
  servicioId: text("servicio_id")
    .notNull()
    .references(() => servicios.id, { onDelete: "cascade" }),
});
