import { pgTable, text } from "drizzle-orm/pg-core";
import { clientes } from "./clientes";
import { timestamptz } from "./shared";

// Empresas de compra y venta para emitir/recibir facturas. contacto_cliente_id
// referencia a clientes.id con ON DELETE SET NULL: si el cliente contacto se
// elimina, la empresa queda desvinculada pero no se borra; contacto_nombre
// queda denormalizado igual para no perder el dato en pantalla.
export const empresas = pgTable("empresas", {
  id: text("id").primaryKey(),
  razonSocial: text("razon_social").notNull(),
  rut: text("rut").notNull().unique(),
  giro: text("giro"),
  direccion: text("direccion"),
  comuna: text("comuna"),
  ciudad: text("ciudad"),
  telefono: text("telefono"),
  contactoClienteId: text("contacto_cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  contactoNombre: text("contacto_nombre"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});
