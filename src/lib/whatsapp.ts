// Número directo para gestionar suscripciones (dar de baja, cambiar tarjeta),
// distinto del WhatsApp general de la web que va a agendamiento y consultas.
// Lo usan las dos salidas del cliente que todavía renueva por WooCommerce:
// RenovacionLegacyCard y el aviso de VehiculoCard que reemplaza a "Eliminar
// Plan", más el error del endpoint /api/cliente/mi-cuenta/eliminar-plan.
export const WHATSAPP_SUSCRIPCIONES = "+569 3230110";
export const WHATSAPP_SUSCRIPCIONES_URL =
  "https://wa.me/5693230110?text=" + encodeURIComponent("Hola, quiero gestionar mi renovación automática");
