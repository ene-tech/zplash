export type DireccionMensajeWhatsapp = "entrante" | "saliente";
export type TipoMensajeWhatsapp = "texto" | "imagen" | "plantilla";
export type EstadoMensajeWhatsapp = "enviado" | "entregado" | "leido" | "fallido";

// Hilo de conversación con un número de WhatsApp — ver comentario en
// @/db/schema/whatsapp sobre el enlace opcional a Cliente.
export interface ConversacionWhatsapp {
  id: string;
  telefono: string;
  clienteId?: string;
  nombreContacto?: string;
  ultimoMensajeEn: string;
  noLeidos: number;
  creadoEn: string;
}

export interface MensajeWhatsapp {
  id: string;
  conversacionId: string;
  direccion: DireccionMensajeWhatsapp;
  texto: string;
  tipo: TipoMensajeWhatsapp;
  estado?: EstadoMensajeWhatsapp;
  whatsappMessageId?: string;
  enviadoPor?: string;
  creadoEn: string;
}

// Plantilla de contenido (no una plantilla pre-aprobada de Meta, ver
// comentario en @/db/schema/whatsapp) para una situación del proceso de
// venta/suscripción o de ofertas y servicios — editable desde Web Settings →
// WhatsApp Webhooks, mismo patrón que PlantillaCorreo.
export interface PlantillaWhatsapp {
  id: string;
  nombre: string;
  categoria?: string;
  mensaje: string;
  activo: boolean;
}
