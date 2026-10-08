import { boolean, index, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "../shared";
import { insumos } from "./insumos";
import { productos } from "./productos";
import { proveedores } from "./proveedores";

// Fabricación por maquila: una fábrica externa produce nuestros químicos
// (productos ZUPER de la tienda e insumos del lavado) según nuestras fórmulas.
//
// Una materia prima puede ser mixta: lo que compramos nosotros queda en la
// fábrica como lotes (costo FIFO), y si al producir no alcanza, el resto lo
// pone la fábrica a `precio_fabrica` y nos lo cobra. Sin precio de fábrica
// (fragancia, envases) la fábrica no la pone: si no alcanza, se bloquea.
export const materiasPrimas = pgTable("materias_primas", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  unidad: text("unidad").notNull().default("L"),
  // null = la fábrica no la pone. Neto, por unidad.
  precioFabrica: numeric("precio_fabrica", { mode: "number" }),
  // Suma de `restante` de sus lotes: se mantiene en la misma transacción
  // que mueve los lotes, para no recalcularla en cada pantalla.
  stock: numeric("stock", { mode: "number" }).notNull().default(0),
  stockMin: numeric("stock_min", { mode: "number" }).notNull().default(0),
  activa: boolean("activa").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Cada compra nuestra es un lote; los consumos salen del más antiguo (FIFO).
export const lotesMateriaPrima = pgTable(
  "lotes_materia_prima",
  {
    id: text("id").primaryKey(),
    materiaPrimaId: text("materia_prima_id")
      .notNull()
      .references(() => materiasPrimas.id, { onDelete: "cascade" }),
    fecha: timestamptz("fecha").notNull().defaultNow(),
    cantidad: numeric("cantidad", { mode: "number" }).notNull(),
    restante: numeric("restante", { mode: "number" }).notNull(),
    // Neto, por unidad de la materia prima.
    costoUnitario: numeric("costo_unitario", { mode: "number" }).notNull().default(0),
    notas: text("notas"),
    creadoPor: text("creado_por"),
  },
  (t) => [index("lotes_materia_prima_mp_idx").on(t.materiaPrimaId, t.fecha)]
);

// La mezcla: qué % del volumen es cada materia prima. Una fórmula se envasa
// en varias presentaciones (20 L, 1 L, 500 ml…).
export const formulas = pgTable("formulas", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  notas: text("notas"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

export const formulaComponentes = pgTable(
  "formula_componentes",
  {
    id: text("id").primaryKey(),
    formulaId: text("formula_id")
      .notNull()
      .references(() => formulas.id, { onDelete: "cascade" }),
    materiaPrimaId: text("materia_prima_id")
      .notNull()
      .references(() => materiasPrimas.id, { onDelete: "restrict" }),
    porcentaje: numeric("porcentaje", { mode: "number" }).notNull(),
  },
  (t) => [index("formula_componentes_formula_idx").on(t.formulaId)]
);

// Un formato de venta/uso de la fórmula: suma stock a un Producto (POS) o a
// un Insumo (lavado), nunca a los dos (check en el SQL).
export const presentaciones = pgTable(
  "presentaciones",
  {
    id: text("id").primaryKey(),
    formulaId: text("formula_id")
      .notNull()
      .references(() => formulas.id, { onDelete: "cascade" }),
    productoId: text("producto_id")
      .unique()
      .references(() => productos.id, { onDelete: "cascade" }),
    insumoId: text("insumo_id")
      .unique()
      .references(() => insumos.id, { onDelete: "cascade" }),
    mlPorUnidad: numeric("ml_por_unidad", { mode: "number" }).notNull(),
    maquilaPorUnidad: numeric("maquila_por_unidad", { mode: "number" }).notNull().default(0),
    activa: boolean("activa").notNull().default(true),
  },
  (t) => [index("presentaciones_formula_idx").on(t.formulaId)]
);

// Envases y demás ítems fijos por unidad (frasco, atomizador, etiqueta).
export const presentacionComponentes = pgTable(
  "presentacion_componentes",
  {
    id: text("id").primaryKey(),
    presentacionId: text("presentacion_id")
      .notNull()
      .references(() => presentaciones.id, { onDelete: "cascade" }),
    materiaPrimaId: text("materia_prima_id")
      .notNull()
      .references(() => materiasPrimas.id, { onDelete: "restrict" }),
    cantidadPorUnidad: numeric("cantidad_por_unidad", { mode: "number" }).notNull(),
  },
  (t) => [index("presentacion_componentes_presentacion_idx").on(t.presentacionId)]
);

// Lo que llegó de la fábrica. Montos congelados al recibir.
export const recepcionesFabrica = pgTable("recepciones_fabrica", {
  id: text("id").primaryKey(),
  fecha: timestamptz("fecha").notNull().defaultNow(),
  proveedorId: text("proveedor_id").references(() => proveedores.id, { onDelete: "set null" }),
  numeroDocumento: text("numero_documento"),
  // Lo que se le paga a la fábrica (neto; el egreso suma IVA).
  totalMaquila: numeric("total_maquila", { mode: "number" }).notNull().default(0),
  totalMateriasFabrica: numeric("total_materias_fabrica", { mode: "number" }).notNull().default(0),
  // Costo FIFO de lo nuestro que se consumió (ya pagado al comprarlo).
  totalPropias: numeric("total_propias", { mode: "number" }).notNull().default(0),
  // Sin FK, igual que movimientos_contables.venta_id.
  movimientoContableId: text("movimiento_contable_id"),
  notas: text("notas"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

export const recepcionFabricaLineas = pgTable(
  "recepcion_fabrica_lineas",
  {
    id: text("id").primaryKey(),
    recepcionId: text("recepcion_id")
      .notNull()
      .references(() => recepcionesFabrica.id, { onDelete: "cascade" }),
    presentacionId: text("presentacion_id").references(() => presentaciones.id, { onDelete: "set null" }),
    productoId: text("producto_id").references(() => productos.id, { onDelete: "set null" }),
    insumoId: text("insumo_id").references(() => insumos.id, { onDelete: "set null" }),
    // Copia del nombre: la línea se sigue leyendo aunque el destino se borre.
    nombre: text("nombre").notNull(),
    unidades: numeric("unidades", { mode: "number" }).notNull(),
    maquila: numeric("maquila", { mode: "number" }).notNull().default(0),
    materiasFabrica: numeric("materias_fabrica", { mode: "number" }).notNull().default(0),
    propias: numeric("propias", { mode: "number" }).notNull().default(0),
  },
  (t) => [index("recepcion_fabrica_lineas_recepcion_idx").on(t.recepcionId)]
);

// Historial de lo nuestro: compras, consumos por recepción y ajustes
// (cantidad con signo), con el lote y el costo de donde salió.
export const movimientosMateriaPrima = pgTable(
  "movimientos_materia_prima",
  {
    id: text("id").primaryKey(),
    materiaPrimaId: text("materia_prima_id")
      .notNull()
      .references(() => materiasPrimas.id, { onDelete: "cascade" }),
    loteId: text("lote_id").references(() => lotesMateriaPrima.id, { onDelete: "set null" }),
    fecha: timestamptz("fecha").notNull().defaultNow(),
    tipo: text("tipo").notNull(),
    cantidad: numeric("cantidad", { mode: "number" }).notNull(),
    costoUnitario: numeric("costo_unitario", { mode: "number" }).notNull().default(0),
    recepcionId: text("recepcion_id").references(() => recepcionesFabrica.id, { onDelete: "set null" }),
    notas: text("notas"),
    creadoPor: text("creado_por"),
  },
  (t) => [index("movimientos_materia_prima_mp_idx").on(t.materiaPrimaId, t.fecha)]
);
