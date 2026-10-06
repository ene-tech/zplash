import { boolean, index, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "../shared";
import { insumos } from "./insumos";
import { proveedores } from "./proveedores";

// Fabricación por maquila: los químicos que usamos (insumos) los produce una
// fábrica externa. Algunas materias primas de la fórmula son nuestras (las
// compramos y quedan guardadas en la fábrica: `propia` = true, se descuentan
// de `stock`); las demás las pone la fábrica y nos las cobra a
// `costo_unitario`. Además se paga mano de obra por litro producido.
export const materiasPrimas = pgTable("materias_primas", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  unidad: text("unidad").notNull().default("kg"),
  propia: boolean("propia").notNull().default(true),
  costoUnitario: numeric("costo_unitario", { mode: "number" }).notNull().default(0),
  stock: numeric("stock", { mode: "number" }).notNull().default(0),
  stockMin: numeric("stock_min", { mode: "number" }).notNull().default(0),
  activa: boolean("activa").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Una fórmula por insumo terminado. Los componentes van en % del volumen: 100 L
// recibidos con un componente al 2% consumen 2 unidades de esa materia prima.
export const formulas = pgTable("formulas", {
  id: text("id").primaryKey(),
  insumoId: text("insumo_id")
    .notNull()
    .unique()
    .references(() => insumos.id, { onDelete: "cascade" }),
  maquilaPorLitro: numeric("maquila_por_litro", { mode: "number" }).notNull().default(0),
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

// Lo que llegó de la fábrica. Los montos quedan congelados al momento de
// recibir (si después cambia la fórmula o una tarifa, la recepción no cambia).
export const recepcionesFabrica = pgTable("recepciones_fabrica", {
  id: text("id").primaryKey(),
  fecha: timestamptz("fecha").notNull().defaultNow(),
  proveedorId: text("proveedor_id").references(() => proveedores.id, { onDelete: "set null" }),
  numeroDocumento: text("numero_documento"),
  totalMaquila: numeric("total_maquila", { mode: "number" }).notNull().default(0),
  totalMateriasFabrica: numeric("total_materias_fabrica", { mode: "number" }).notNull().default(0),
  // Sin FK, igual que movimientos_contables.venta_id: si alguien borra el
  // egreso en Contabilidad la recepción no debe bloquearlo.
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
    insumoId: text("insumo_id").references(() => insumos.id, { onDelete: "set null" }),
    // Copia del nombre: la línea se sigue leyendo aunque el insumo se borre.
    insumoNombre: text("insumo_nombre").notNull(),
    litros: numeric("litros", { mode: "number" }).notNull(),
    maquila: numeric("maquila", { mode: "number" }).notNull().default(0),
    materiasFabrica: numeric("materias_fabrica", { mode: "number" }).notNull().default(0),
  },
  (t) => [index("recepcion_fabrica_lineas_recepcion_idx").on(t.recepcionId)]
);

// Historial del stock de materias primas propias: cada compra, consumo por
// recepción o ajuste deja su fila (cantidad con signo).
export const movimientosMateriaPrima = pgTable(
  "movimientos_materia_prima",
  {
    id: text("id").primaryKey(),
    materiaPrimaId: text("materia_prima_id")
      .notNull()
      .references(() => materiasPrimas.id, { onDelete: "cascade" }),
    fecha: timestamptz("fecha").notNull().defaultNow(),
    tipo: text("tipo").notNull(),
    cantidad: numeric("cantidad", { mode: "number" }).notNull(),
    recepcionId: text("recepcion_id").references(() => recepcionesFabrica.id, { onDelete: "set null" }),
    notas: text("notas"),
    creadoPor: text("creado_por"),
  },
  (t) => [index("movimientos_materia_prima_mp_idx").on(t.materiaPrimaId, t.fecha)]
);
