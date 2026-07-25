import { boolean, index, integer, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

// Máquina/equipo del túnel de lavado (ej. cepillos, secadores, bomba de
// agua) — catálogo administrable desde Libro de Mantención → Máquinas, mismo
// patrón que destinos_inventario.
//
// `periodicidad_tipo` define cómo se calcula la próxima mantención (ver
// mantencionStatus en @/lib/helpers/mantencion): "fecha" usa `intervalo_dias`
// contados desde la última mantención (o `creado_en` si no tiene ninguna);
// "conteo" usa `intervalo_lavados` contra vehiculosDesdeUltimaMantencion. Solo
// uno de los dos intervalos aplica según el tipo elegido; null = sin
// periodicidad configurada (la máquina no muestra estado de "próxima
// mantención" en su ficha).
export const maquinarias = pgTable("maquinarias", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  tipo: text("tipo"),
  activo: boolean("activo").notNull().default(true),
  periodicidadTipo: text("periodicidad_tipo"),
  intervaloDias: integer("intervalo_dias"),
  intervaloLavados: integer("intervalo_lavados"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Registro de una mantención realizada a una maquinaria. `vehiculos_desde_ultima`
// se calcula al guardar (ver vehiculosDesdeUltimaMantencion en
// @/lib/helpers/mantencion) contando los ingresos entre la mantención
// anterior de esta misma máquina y la fecha de este registro — queda
// guardado como snapshot histórico en vez de recalcularse siempre, para que
// un registro viejo no cambie de valor si se agrega una mantención anterior
// a él más tarde.
export const registrosMantencion = pgTable(
  "registros_mantencion",
  {
    id: text("id").primaryKey(),
    maquinariaId: text("maquinaria_id")
      .notNull()
      .references(() => maquinarias.id, { onDelete: "cascade" }),
    fecha: timestamptz("fecha").notNull().defaultNow(),
    descripcion: text("descripcion").notNull(),
    responsable: text("responsable"),
    costo: numeric("costo", { mode: "number" }),
    vehiculosDesdeUltima: integer("vehiculos_desde_ultima").notNull().default(0),
    notas: text("notas"),
    creadoPor: text("creado_por"),
  },
  (t) => [index("registros_mantencion_fecha_idx").on(t.fecha)]
);

// Aviso puntual de una mantención futura agendada a mano, independiente de la
// periodicidad automática de la maquinaria (ver comentario de
// periodicidad_tipo arriba) — permite agendar por ejemplo "aseo general del
// aire acondicionado" con fecha_objetivo en 8 meses aunque esa máquina no
// tenga una regla recurrente configurada. `estado` pasa de "pendiente" a
// "completada" (con registro_mantencion_id apuntando al RegistroMantencion
// creado al cerrarla) o "cancelada" — nunca se borra sola, queda como
// historial de lo agendado.
export const alertasMantencion = pgTable(
  "alertas_mantencion",
  {
    id: text("id").primaryKey(),
    maquinariaId: text("maquinaria_id")
      .notNull()
      .references(() => maquinarias.id, { onDelete: "cascade" }),
    descripcion: text("descripcion").notNull(),
    fechaObjetivo: timestamptz("fecha_objetivo").notNull(),
    estado: text("estado").notNull().default("pendiente"),
    notas: text("notas"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
    creadoPor: text("creado_por"),
    completadoEn: timestamptz("completado_en"),
    registroMantencionId: text("registro_mantencion_id").references(() => registrosMantencion.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("alertas_mantencion_fecha_objetivo_idx").on(t.fechaObjetivo)]
);
