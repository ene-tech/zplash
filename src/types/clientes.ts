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
  fechaContratacion?: string | null;
  origen?: "WEB" | "LOCAL";
  visitas?: number;
  ultimaVisita?: string;
  ultimaRenovacion?: string;
  creadoEn: string;
  creadoPor?: string;
}
