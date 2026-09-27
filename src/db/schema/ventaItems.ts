import { index, integer, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { productos } from "./inventario/productos";
import { ventas } from "./ventas";

// Una línea de un ticket del POS: qué producto, cuántas unidades y a qué
// precio se vendió. `sku`/`detalle` son snapshot al momento de la venta (el
// producto puede renombrarse o borrarse después; la boleta histórica no debe
// cambiar) — por eso la FK a productos va con set null y la de ventas con
// cascade (las líneas no existen sin su ticket).
export const ventaItems = pgTable(
  "venta_items",
  {
    // `${ventaId}-${índice}` — determinístico dentro del ticket.
    id: text("id").primaryKey(),
    ventaId: text("venta_id")
      .notNull()
      .references(() => ventas.id, { onDelete: "cascade" }),
    productoId: text("producto_id").references(() => productos.id, { onDelete: "set null" }),
    sku: text("sku").notNull(),
    detalle: text("detalle").notNull(),
    cantidad: integer("cantidad").notNull(),
    precioUnitario: numeric("precio_unitario", { mode: "number" }).notNull(),
  },
  (t) => [index("venta_items_venta_id_idx").on(t.ventaId)]
);
