import { boolean, index, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

export const movimientosContables = pgTable(
  "movimientos_contables",
  {
    id: text("id").primaryKey(),
    tipo: text("tipo").notNull(),
    fecha: timestamptz("fecha").notNull().defaultNow(),
    descripcion: text("descripcion").notNull(),
    categoria: text("categoria"),
    contraparte: text("contraparte"),
    rutProveedor: text("rut_proveedor"),
    numeroFactura: text("numero_factura"),
    tipoDocumento: text("tipo_documento"),
    documentoUrl: text("documento_url"),
    documentoNombre: text("documento_nombre"),
    monto: numeric("monto", { mode: "number" }).notNull().default(0),
    estado: text("estado").notNull().default("pendiente"),
    metodoPago: text("metodo_pago"),
    notas: text("notas"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
    creadoPor: text("creado_por"),
    fechaPago: timestamptz("fecha_pago"),
    // Solo presente en filas generadas automáticamente desde una Venta (ver
    // movimientoContableDesdeVenta en @/lib/helpers). Sin FK estricta a
    // ventas.id para no bloquear el insert si algún día se borra la venta.
    ventaId: text("venta_id"),
  },
  (t) => [index("movimientos_contables_fecha_idx").on(t.fecha)]
);

// Línea individual importada de una cartola bancaria (hoy solo Santander
// Empresa, vía PDF de "Cartolas históricas" de Office Banking — ver
// @/lib/cartolaParser). `movimientoContableId` liga esta línea a un
// movimiento ya registrado en la app cuando el usuario confirma el vínculo
// manualmente (ver ConciliacionBancariaTab); nunca se linkea solo.
export const cartolaMovimientos = pgTable(
  "cartola_movimientos",
  {
    id: text("id").primaryKey(),
    cuenta: text("cuenta").notNull().default("santander_empresa"),
    fecha: timestamptz("fecha").notNull(),
    glosa: text("glosa").notNull(),
    cargo: numeric("cargo", { mode: "number" }).notNull().default(0),
    abono: numeric("abono", { mode: "number" }).notNull().default(0),
    saldo: numeric("saldo", { mode: "number" }),
    numeroDocumento: text("numero_documento"),
    sucursal: text("sucursal"),
    // Etiqueta libre (ej. "Ingreso Tarjeta POS (GETNET)"), asignada por una
    // regla de @/lib/db#reglasConciliacion o a mano en la UI. Taxonomía propia,
    // sin relación con `movimientosContables.categoria` (esa sigue el EERR).
    categoria: text("categoria"),
    estado: text("estado").notNull().default("pendiente"), // pendiente | conciliado | ignorado
    movimientoContableId: text("movimiento_contable_id").references(() => movimientosContables.id, { onDelete: "set null" }),
    notas: text("notas"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
    creadoPor: text("creado_por"),
  },
  (t) => [index("cartola_movimientos_fecha_idx").on(t.fecha)]
);

// Reglas "aprendidas" para clasificar automáticamente futuras líneas de
// cartola: si la glosa contiene `id` (case-insensitive), se le asigna
// `categoria` al importar (ver importarCartola en @/lib/actions). `id` es el
// propio patrón (mismo criterio que `precios.plan`) para que enseñar una
// regla nueva sea un upsert simple, sin necesitar una columna unique aparte.
export const reglasConciliacion = pgTable("reglas_conciliacion", {
  id: text("id").primaryKey(),
  categoria: text("categoria").notNull(),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

export const categoriasGasto = pgTable("categorias_gasto", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  grupo: text("grupo").notNull(),
  activa: boolean("activa").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Canal seleccionable en el formulario de Ingresos (ver CategoriaIngreso en
// @/types) — sin "grupo": a diferencia de categorias_gasto, no está atada a
// la estructura fija del EERR.
export const categoriasIngreso = pgTable("categorias_ingreso", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  activa: boolean("activa").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});
