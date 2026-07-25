import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

// Catálogo de plantillas de correo administrado desde Web Settings → Mail
// Templates: una fila por situación del proceso de venta/suscripción
// (confirmación de compra, pago rechazado, vencimiento próximo, etc.) o por
// comunicación de ofertas y servicios — mismo patrón de catálogo que
// `servicios`. Todavía no hay envío automático de correos: esta tabla guarda
// el contenido para cuando se conecte un proveedor de envío.
export const plantillasCorreo = pgTable("plantillas_correo", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  categoria: text("categoria"),
  asunto: text("asunto").notNull(),
  cuerpo: text("cuerpo").notNull(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});
