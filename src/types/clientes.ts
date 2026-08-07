// Snapshot opcional de datos de facturación. Lo comparten Cliente y Venta a
// propósito (mismos 5 campos en ambas tablas, ver supabase/schema.sql): al
// registrar una venta con Factura se copian los datos vigentes del cliente
// en ese momento, para no perder el dato histórico si el cliente los cambia
// después. Empresa NO usa este tipo: ahí razonSocial/rut son el registro
// maestro (obligatorios, sin tipoDocumento), no una copia puntual.
export interface DatosFacturacion {
  tipoDocumento?: "Boleta" | "Factura";
  razonSocial?: string;
  rut?: string;
  direccion?: string;
  giro?: string;
}

export interface Cliente extends DatosFacturacion {
  id: string;
  nombre: string;
  patente: string;
  telefono?: string;
  email?: string;
  vehiculo?: string;
  plan?: string;
  vencimiento?: string | null;
  patentePendiente?: string | null;
  patentePendienteDesde?: string | null;
  fechaContratacion?: string | null;
  // Seteado por el webhook de suscripción de WooCommerce cuando la
  // suscripción del cliente se cancela/vence; lo limpia el webhook de
  // pedidos al recontratar. Uso interno de esos dos endpoints — no hay UI que
  // lo lea o lo edite (ver /api/webhooks/woocommerce/{route,suscripcion}.ts).
  suscripcionCanceladaEn?: string | null;
  origen?: "WEB" | "LOCAL";
  visitas?: number;
  ultimaVisita?: string;
  ultimaRenovacion?: string;
  creadoEn: string;
  creadoPor?: string;
}

// Patch de un cliente existente: solo los campos que una sesión realmente
// cambió respecto a su propia copia previa (ver patchDeCliente en
// @/lib/helpers/clientes), no la fila completa. upsertClientes (@/lib/serverActions y
// @/lib/dataAccess) escribe en la base únicamente estas columnas — así una
// sesión con una copia desactualizada nunca pisa un campo que no tocó (ver
// memoria del caso HERNAN, 2026-07-27). Un Cliente completo también es un
// ClientePatch válido: es como se representa un alta nueva.
export type ClientePatch = { id: string } & Partial<Omit<Cliente, "id">>;
