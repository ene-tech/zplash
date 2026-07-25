import type { PlantillaWhatsapp } from "@/types";

/** Semilla/fallback de catálogo para cuando la tabla `plantillas_whatsapp`
 * está vacía o la migración todavía no corrió — mismo patrón que
 * PLANTILLAS_CORREO_DEFAULT. Mensajes cortos e informales, tono WhatsApp.
 * Variables disponibles: {{nombre}}, {{patente}}, {{plan}}, {{monto}},
 * {{fechaVencimiento}}. */
export const PLANTILLAS_WHATSAPP_DEFAULT: PlantillaWhatsapp[] = [
  {
    id: "wa-compra-confirmada",
    categoria: "Proceso de venta",
    nombre: "Confirmación de compra (plan nuevo)",
    mensaje: "¡Hola {{nombre}}! Confirmamos la compra de tu plan {{plan}} para la patente {{patente}}. ¡Bienvenido a ZPlash!",
    activo: true,
  },
  {
    id: "wa-renovacion-confirmada",
    categoria: "Proceso de venta",
    nombre: "Confirmación de renovación de plan",
    mensaje: "Hola {{nombre}}, renovamos tu plan {{plan}} para la patente {{patente}}. Tu nuevo vencimiento es el {{fechaVencimiento}}.",
    activo: true,
  },
  {
    id: "wa-pago-rechazado",
    categoria: "Proceso de venta",
    nombre: "Pago rechazado",
    mensaje: "Hola {{nombre}}, no pudimos procesar el pago de {{monto}} para tu plan {{plan}}. ¿Intentamos de nuevo?",
    activo: true,
  },
  {
    id: "wa-cobro-automatico-exitoso",
    categoria: "Proceso de venta",
    nombre: "Cobro automático (suscripción) exitoso",
    mensaje: "Hola {{nombre}}, cobramos {{monto}} de tu suscripción del plan {{plan}}. Nuevo vencimiento: {{fechaVencimiento}}.",
    activo: true,
  },
  {
    id: "wa-cobro-automatico-fallido",
    categoria: "Proceso de venta",
    nombre: "Cobro automático (suscripción) fallido",
    mensaje: "Hola {{nombre}}, no pudimos cobrar tu suscripción del plan {{plan}}. Revisa tu método de pago para no perderla.",
    activo: true,
  },
  {
    id: "wa-vencimiento-proximo",
    categoria: "Proceso de venta",
    nombre: "Recordatorio de vencimiento próximo",
    mensaje: "Hola {{nombre}}, tu plan {{plan}} vence el {{fechaVencimiento}}. ¡Renueva a tiempo!",
    activo: true,
  },
  {
    id: "wa-reactivacion-plan-vencido",
    categoria: "Proceso de venta",
    nombre: "Reactivación de plan vencido",
    mensaje: "Hola {{nombre}}, tu plan {{plan}} está vencido. Tenemos un precio preferencial de reactivación para ti.",
    activo: true,
  },
  {
    id: "wa-servicio-adicional-confirmado",
    categoria: "Proceso de venta",
    nombre: "Compra de servicio adicional confirmada",
    mensaje: "Hola {{nombre}}, confirmamos tu servicio adicional para la patente {{patente}} por {{monto}}.",
    activo: true,
  },
  {
    id: "wa-oferta-promocional",
    categoria: "Ofertas y servicios",
    nombre: "Oferta promocional",
    mensaje: "",
    activo: true,
  },
];
