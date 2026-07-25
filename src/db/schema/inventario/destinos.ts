import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "../shared";
import { productos } from "./productos";

// Destino físico donde puede estar un producto de inventario: Bodega (origen
// implícito de todo el stock) o una máquina vending — catálogo administrable
// desde Inventario → Destinos, mismo patrón que categorias_producto.
// `esBodega` marca el único destino que actúa como origen implícito de
// productos.stock (ver stockPorDestino en helpers.ts); se guarda como
// columna en vez de matchear por nombre, para no depender de que nadie
// renombre "Bodega" desde la UI.
export const destinosInventario = pgTable("destinos_inventario", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  esBodega: boolean("es_bodega").notNull().default(false),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Traspaso de stock de un producto entre dos destinos (ej. reponer una
// máquina vending sacando cantidad de Bodega). La cantidad disponible en cada
// destino no se guarda directo en una columna: se calcula sumando/restando
// estos movimientos (ver stockPorDestino en helpers.ts) contra el stock total
// del producto, que no cambia con un traspaso entre destinos — solo con una
// compra/ajuste editado a mano en el producto mismo. `folio` es correlativo e
// irrepetible por guía (ver generarFolioTraspaso en helpers/ids.ts): las
// líneas de una misma guía (un producto por línea) comparten folio, no es
// único por fila.
export const movimientosInventario = pgTable(
  "movimientos_inventario",
  {
    id: text("id").primaryKey(),
    folio: text("folio").notNull(),
    productoId: text("producto_id")
      .notNull()
      .references(() => productos.id, { onDelete: "cascade" }),
    origenId: text("origen_id")
      .notNull()
      .references(() => destinosInventario.id, { onDelete: "restrict" }),
    destinoId: text("destino_id")
      .notNull()
      .references(() => destinosInventario.id, { onDelete: "restrict" }),
    cantidad: integer("cantidad").notNull(),
    fecha: timestamptz("fecha").notNull().defaultNow(),
    notas: text("notas"),
    creadoPor: text("creado_por"),
  },
  (t) => [index("movimientos_inventario_fecha_idx").on(t.fecha)]
);
