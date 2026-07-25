// Plantilla de correo para una situación del proceso de venta/suscripción
// (confirmación de compra, pago rechazado, vencimiento próximo, etc.) o para
// comunicación de ofertas y servicios — contenido editable desde Web
// Settings → Mail Templates, mismo patrón de catálogo que Servicio. El envío
// real todavía no existe: por ahora esto es solo el editor del contenido.
export interface PlantillaCorreo {
  id: string;
  nombre: string;
  categoria?: string;
  asunto: string;
  cuerpo: string;
  activo: boolean;
}
