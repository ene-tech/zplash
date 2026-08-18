import { pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "../shared";

// Proveedor de productos de inventario, distinto de `empresas` (esa es para
// facturación de compra/venta) — catálogo simple referenciado desde
// `productos.proveedor_id` como proveedor preferente.
export const proveedores = pgTable("proveedores", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  rut: text("rut"),
  telefono: text("telefono"),
  email: text("email"),
  direccion: text("direccion"),
  contacto: text("contacto"),
  emailVendedor: text("email_vendedor"),
  telefonoVendedor: text("telefono_vendedor"),
  emailComprobantes: text("email_comprobantes"),
  banco: text("banco"),
  cuentaCorriente: text("cuenta_corriente"),
  // Glosa de gasto habitual del proveedor: referencia por nombre a
  // `categorias_gasto.nombre` (mismo criterio sin FK que
  // `movimientos_contables.categoria`), para precargar el tipo de gasto al
  // registrar un egreso desde su RUT.
  categoriaGasto: text("categoria_gasto"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});
