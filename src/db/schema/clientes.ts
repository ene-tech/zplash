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
  // Seteado por el webhook de suscripción de WooCommerce (ver
  // /api/webhooks/woocommerce/suscripcion) cuando WooCommerce Subscriptions
  // avisa que la suscripción de este cliente pasó a "cancelled"/"expired".
  // El webhook de pedidos (/api/webhooks/woocommerce) lo consulta: si hay un
  // pedido nuevo para este cliente y esta marca está seteada, ese pedido es
  // una recontratación (fechaContratacion y vencimiento se reinician), no una
  // renovación más del ciclo anterior — y la marca se limpia. Sin esto, un
  // cliente que cancela y vuelve a contratar quedaba indistinguible de uno
  // que nunca canceló, y el vencimiento seguía apilándose sobre el ciclo
  // viejo.
  suscripcionCanceladaEn: timestamptz("suscripcion_cancelada_en"),
  origen: text("origen").notNull().default("LOCAL"),
  visitas: integer("visitas").notNull().default(0),
  ultimaVisita: timestamptz("ultima_visita"),
  ultimaRenovacion: timestamptz("ultima_renovacion"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});
