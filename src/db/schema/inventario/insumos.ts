import { boolean, integer, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "../shared";
import { proveedores } from "./proveedores";

// Categoría seleccionable en el formulario de Insumo (ver CategoriaInsumo en
// @/types) — administrable desde Inventario → Categorías, mismo patrón que
// categorias_producto.
export const categoriasInsumo = pgTable("categorias_insumo", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  activa: boolean("activa").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Insumo de consumo interno (limpieza/baño-aseo/oficina): a diferencia de
// `productos` (que se venden por web/vending, con valor_venta), un insumo
// nunca se vende — solo se gasta para prestar el servicio o para operar la
// oficina, por eso no tiene valor_venta ni sku/código de vending.
export const insumos = pgTable("insumos", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  categoriaId: text("categoria_id").references(() => categoriasInsumo.id, { onDelete: "set null" }),
  valorCompra: numeric("valor_compra", { mode: "number" }).notNull().default(0),
  // numeric: los químicos que llegan de la fábrica se cuentan en litros (ver fabricacion.ts).
  stock: numeric("stock", { mode: "number" }).notNull().default(0),
  stockMin: integer("stock_min").notNull().default(0),
  stockMax: integer("stock_max").notNull().default(0),
  proveedorId: text("proveedor_id").references(() => proveedores.id, { onDelete: "set null" }),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});
