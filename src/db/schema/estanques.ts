import { desc } from "drizzle-orm";
import { boolean, index, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

// Estanque físico del local (agua cruda, agua tratada, shampoo, cera) con
// su calibración. La calibración vive acá y NO en el firmware del sensor a
// propósito: dos sensores del mismo modelo leen distinto, el estanque nunca
// tiene la geometría del catálogo, y corregir eso no puede implicar
// reflashear un ESP32 arriba de una escalera.
//
// litros = (crudo - offset_crudo) * litros_por_unidad, donde `crudo` es lo
// que manda el sensor sin interpretar (cm de columna para un transductor de
// presión, cm de distancia al espejo de agua para un ultrasónico — en ese
// caso `litros_por_unidad` es negativo y `offset_crudo` es la distancia a
// estanque lleno). Se guarda solo el crudo en lecturas_estanque: así
// recalibrar corrige también el historial, en vez de dejarlo mintiendo.
export const estanques = pgTable("estanques", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  // Qué contiene — texto libre y no una tabla aparte, mismo criterio que
  // maquinarias.zona: es solo la etiqueta con la que se agrupa el listado.
  contenido: text("contenido"),
  capacidadLitros: numeric("capacidad_litros", { mode: "number" }).notNull(),
  offsetCrudo: numeric("offset_crudo", { mode: "number" }).notNull().default(0),
  litrosPorUnidad: numeric("litros_por_unidad", { mode: "number" }).notNull().default(1),
  // Bajo esto el estanque se muestra en rojo. null = 20% de la capacidad
  // (ver umbralBajo en @/lib/helpers/estanques).
  umbralBajoLitros: numeric("umbral_bajo_litros", { mode: "number" }),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Serie de tiempo cruda del sensor. Una fila por estanque y por ciclo de
// telemetría (~1 min), sin agregación: a un minuto por fila son ~525k filas
// al año por estanque, que Postgres absorbe sin despeinarse mientras el
// índice cubra "la última de este estanque", que es la única consulta que
// hace la app hoy.
export const lecturasEstanque = pgTable(
  "lecturas_estanque",
  {
    id: text("id").primaryKey(),
    estanqueId: text("estanque_id")
      .notNull()
      .references(() => estanques.id, { onDelete: "cascade" }),
    crudo: numeric("crudo", { mode: "number" }).notNull(),
    medidoEn: timestamptz("medido_en").notNull().defaultNow(),
  },
  // medido_en DESC y no ASC: la única consulta que corre sobre esta tabla es
  // "la última de cada estanque" (DISTINCT ON ... ORDER BY estanque_id,
  // medido_en DESC). Un btree se recorre entero hacia adelante o entero hacia
  // atrás, no mezclando direcciones — con el índice ascendente Postgres tenía
  // que ordenar la serie completa en cada poll.
  (t) => [index("lecturas_estanque_estanque_idx").on(t.estanqueId, desc(t.medidoEn))]
);

// Válvula motorizada/solenoide. `abierta` es el estado DESEADO (lo que pidió
// el operador desde la app), no el real: el dispositivo lo lee en cada ciclo
// de telemetría y recién cuando reporta que lo aplicó se estampa
// `confirmada_en`. La UI muestra los dos — una válvula pedida hace 3 minutos
// y nunca confirmada significa que el dispositivo está caído, y eso no se
// puede ver como "abierta".
export const valvulas = pgTable(
  "valvulas",
  {
    id: text("id").primaryKey(),
    nombre: text("nombre").notNull().unique(),
    // Qué estanque llena — null = válvula suelta (ej. corte general). Sirve
    // para el corte por estanque lleno en /api/estanques/telemetria.
    estanqueId: text("estanque_id").references(() => estanques.id, { onDelete: "set null" }),
    abierta: boolean("abierta").notNull().default(false),
    cambiadoEn: timestamptz("cambiado_en").notNull().defaultNow(),
    cambiadoPor: text("cambiado_por"),
    confirmadaEn: timestamptz("confirmada_en"),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [index("valvulas_estanque_idx").on(t.estanqueId)]
);
