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
  // Ver ilimitadoHasta en db/schema/clientes.ts — hasta cuándo se le respetan
  // los lavados sin tope del ilimitado viejo a un cliente que ya pagó el X5.
  ilimitadoHasta?: string | null;
  // Ver aceptoX5En en db/schema/clientes.ts — cuándo el cliente del ilimitado
  // viejo aceptó explícitamente pasar al X5. null = todavía no lo acepta y
  // ningún cobro puede migrarlo (ver requiereValidacionX5 en helpers/precios).
  aceptoX5En?: string | null;
  vencimiento?: string | null;
  patentePendiente?: string | null;
  patentePendienteDesde?: string | null;
  fechaContratacion?: string | null;
  // Seteado por el webhook de suscripción de WooCommerce cuando la
  // suscripción del cliente se cancela/vence; lo limpia el webhook de
  // pedidos al recontratar. Uso interno de esos dos endpoints — no hay UI que
  // lo lea o lo edite (ver /api/webhooks/woocommerce/{route,suscripcion}.ts).
  suscripcionCanceladaEn?: string | null;
  // Ver renovacionAutoWooDesde en db/schema/clientes.ts — evidencia de que la
  // renovación mensual de este cliente sigue cobrándola WooCommerce
  // Subscriptions (sistema anterior), usada para mostrárselo en Mi Cuenta.
  renovacionAutoWooDesde?: string | null;
  // Ver precioPlanHeredado en db/schema/clientes.ts — precio de plan que se le
  // respeta a este cliente al renovar antes de vencer, por debajo del vigente.
  precioPlanHeredado?: number | null;
  // Ver sinComunicacionAuto en db/schema/clientes.ts — true deja a este
  // cliente fuera de toda plantilla automática (reglas de WhatsApp y de
  // correo). Se marca desde la ficha del cliente en el Operador.
  sinComunicacionAuto?: boolean;
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
