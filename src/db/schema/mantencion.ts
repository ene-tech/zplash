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
  // Zona/sector del local donde vive la máquina (ej. "Túnel", "Aspirado") —
  // texto libre y no una tabla aparte: es solo la categoría madre con la que
  // se agrupa el listado y los selectores, no tiene datos propios que
  // administrar. null = "Sin zona".
  zona: text("zona"),
  tipo: text("tipo"),
  activo: boolean("activo").notNull().default(true),
  // Legacy: la periodicidad única por máquina se migró a planes_mantencion
  // (una máquina tiene varias mantenciones distintas). Ya no se lee — las
  // columnas quedan por si hay que auditar el backfill (drizzle/0069).
  periodicidadTipo: text("periodicidad_tipo"),
  intervaloDias: integer("intervalo_dias"),
  intervaloLavados: integer("intervalo_lavados"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Cada tarea de mantención que requiere una máquina, con sus repuestos y su
// periodicidad propia (ej. "Cambio de escobillas del cepillo lateral" cada
// 5.000 lavados, repuestos "2x escobilla PVC 60cm") — es la planilla que se
// ve en la ficha de la máquina. Reemplaza a la periodicidad única que vivía
// en maquinarias.periodicidad_tipo/intervalo_* (una máquina tiene varias
// mantenciones distintas, no una sola).
//
// `aviso_dias`/`aviso_lavados` es la anticipación con la que la tarea pasa a
// "Por vencer" (para alcanzar a comprar repuestos): null usa el default de
// planMantencionStatus en @/lib/helpers/mantencion. El estado se calcula en
// vivo desde los registros_mantencion con este plan_id — no hay filas de
// alerta generadas por un job.
export const planesMantencion = pgTable(
  "planes_mantencion",
  {
    id: text("id").primaryKey(),
    maquinariaId: text("maquinaria_id")
      .notNull()
      .references(() => maquinarias.id, { onDelete: "cascade" }),
    descripcion: text("descripcion").notNull(),
    repuestos: text("repuestos"),
    periodicidadTipo: text("periodicidad_tipo").notNull(),
    intervaloDias: integer("intervalo_dias"),
    intervaloLavados: integer("intervalo_lavados"),
    avisoDias: integer("aviso_dias"),
    avisoLavados: integer("aviso_lavados"),
    // Punto de partida cuando la ficha se crea con la máquina ya en marcha:
    // `ultima_vez_en` es cuándo se hizo esta mantención por última vez antes
    // de existir el sistema, y `lavados_previos` cuántos lavados lleva
    // acumulados desde entonces. Los dos se ignoran apenas hay un
    // RegistroMantencion con este plan_id — de ahí en adelante manda la
    // bitácora real (ver planMantencionStatus en @/lib/helpers/mantencion).
    ultimaVezEn: timestamptz("ultima_vez_en"),
    lavadosPrevios: integer("lavados_previos"),
    activo: boolean("activo").notNull().default(true),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
    creadoPor: text("creado_por"),
  },
  (t) => [index("planes_mantencion_maquinaria_idx").on(t.maquinariaId)]
);

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
    // Qué tarea del plan cumple este registro — null = mantención suelta que
    // no corresponde a ninguna tarea planificada. Es lo que resetea el
    // contador de esa tarea (ver planMantencionStatus); "set null" para que
    // borrar una tarea del plan no borre la bitácora.
    planId: text("plan_id").references(() => planesMantencion.id, { onDelete: "set null" }),
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
