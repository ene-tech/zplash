import { index, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";
import { movimientosContables } from "./contabilidad";

// Documento tributario electrónico que un proveedor le emitió a Zplash y que
// llegó como XML a facturascompra@zplash.cl (correo de intercambio del SII).
// Lo carga @/lib/comprasRecepcion leyendo esa casilla. `id` es
// "<rut emisor>-<tipo>-<folio>": el mismo documento puede llegar más de una
// vez (reenvíos del proveedor) y así queda una sola fila.
//
// Clasificar = decir si es gasto (categoria de categorias_gasto, crea o
// vincula un egreso en movimientos_contables) o compra de activo (categoria
// de CATEGORIAS_ACTIVO, no entra al EERR).
export const documentosCompra = pgTable(
  "documentos_compra",
  {
    id: text("id").primaryKey(),
    tipoDte: numeric("tipo_dte", { mode: "number" }).notNull(),
    folio: numeric("folio", { mode: "number" }).notNull(),
    fechaEmision: text("fecha_emision").notNull(), // YYYY-MM-DD, como viene en el XML
    fechaVencimiento: text("fecha_vencimiento"),
    rutEmisor: text("rut_emisor").notNull(),
    razonSocialEmisor: text("razon_social_emisor").notNull(),
    giroEmisor: text("giro_emisor"),
    montoNeto: numeric("monto_neto", { mode: "number" }).notNull().default(0),
    montoExento: numeric("monto_exento", { mode: "number" })
      .notNull()
      .default(0),
    iva: numeric("iva", { mode: "number" }).notNull().default(0),
    montoTotal: numeric("monto_total", { mode: "number" }).notNull().default(0),
    detalle: jsonb("detalle")
      .$type<
        { nombre: string; cantidad?: number; precio?: number; monto: number }[]
      >()
      .notNull()
      .default([]),
    xml: text("xml").notNull(),
    correoDe: text("correo_de"),
    correoAsunto: text("correo_asunto"),
    recibidoEn: timestamptz("recibido_en").notNull().defaultNow(),
    estado: text("estado").notNull().default("pendiente"), // pendiente | contabilizado | ignorado
    clasificacion: text("clasificacion"), // gasto | activo
    categoria: text("categoria"),
    movimientoContableId: text("movimiento_contable_id").references(
      () => movimientosContables.id,
      { onDelete: "set null" },
    ),
    clasificadoEn: timestamptz("clasificado_en"),
    clasificadoPor: text("clasificado_por"),
  },
  (t) => [
    index("documentos_compra_fecha_idx").on(t.fechaEmision),
    index("documentos_compra_rut_idx").on(t.rutEmisor),
  ],
);
