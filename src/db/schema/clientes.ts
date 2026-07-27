import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

export const clientes = pgTable("clientes", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  patente: text("patente").notNull().unique(),
  telefono: text("telefono"),
  email: text("email"),
  vehiculo: text("vehiculo"),
  plan: text("plan"),
  tipoDocumento: text("tipo_documento"),
  razonSocial: text("razon_social"),
  rut: text("rut"),
  direccion: text("direccion"),
  giro: text("giro"),
  vencimiento: timestamptz("vencimiento"),
  // Patente solicitada para reemplazar la actual, que recién se aplica cuando
  // el plan vigente renueva a un período nuevo (ver resolverPatentePendiente
  // en @/lib/helpers/clientes y su uso en dataAccess/clientes.ts::upsertClientes
  // y en @/lib/pagos/aplicarPagoAprobado) — hasta entonces `patente` sigue
  // siendo la registrada, para no perder validez de ingreso a mitad de mes.
  patentePendiente: text("patente_pendiente"),
  patentePendienteDesde: timestamptz("patente_pendiente_desde"),
  fechaContratacion: timestamptz("fecha_contratacion"),
  origen: text("origen").notNull().default("LOCAL"),
  visitas: integer("visitas").notNull().default(0),
  ultimaVisita: timestamptz("ultima_visita"),
  ultimaRenovacion: timestamptz("ultima_renovacion"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});
