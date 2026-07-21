// Catálogo de servicios (fusiona el antiguo listado hardcodeado
// SERVICIOS_ADICIONALES): lo usan tanto ServiciosAdicionalesView (venta
// rápida en el POS) como la Agenda — equivalente a "procedimientos" en
// ConsultaPro. El precio no vive acá, sigue en Precios (keyed por Servicio.id).
export interface Servicio {
  id: string;
  nombre: string;
  categoria?: string;
  duracionMinutos: number;
  activo: boolean;
  imagen?: string;
}
