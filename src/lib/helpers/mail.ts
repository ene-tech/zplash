import type { PlantillaCorreo } from "@/types";

/** Semilla/fallback de catálogo para cuando la tabla `plantillas_correo`
 * está vacía o la migración todavía no corrió — mismo patrón que
 * SERVICIOS_DEFAULT. Cubre las situaciones que pueden ocurrir durante el
 * proceso de venta de un plan/servicio; asunto y cuerpo quedan como
 * placeholder editable de inmediato desde Web Settings → Mail Templates.
 * Variables disponibles en el cuerpo: {{nombre}}, {{patente}}, {{plan}},
 * {{monto}}, {{fechaVencimiento}}. */
export const PLANTILLAS_CORREO_DEFAULT: PlantillaCorreo[] = [
  {
    id: "compra-confirmada",
    categoria: "Proceso de venta",
    nombre: "Confirmación de compra (plan nuevo)",
    asunto: "¡Bienvenido a ZPlash, {{nombre}}!",
    cuerpo: "Hola {{nombre}}, confirmamos la compra de tu plan {{plan}} para la patente {{patente}}. ¡Gracias por preferirnos!",
    activo: true,
  },
  {
    id: "renovacion-confirmada",
    categoria: "Proceso de venta",
    nombre: "Confirmación de renovación de plan",
    asunto: "Renovamos tu plan ZPlash",
    cuerpo: "Hola {{nombre}}, renovamos tu plan {{plan}} para la patente {{patente}}. Tu nuevo vencimiento es el {{fechaVencimiento}}.",
    activo: true,
  },
  {
    id: "pago-rechazado",
    categoria: "Proceso de venta",
    nombre: "Pago rechazado",
    asunto: "No pudimos procesar tu pago",
    cuerpo: "Hola {{nombre}}, no pudimos procesar el pago de {{monto}} para tu plan {{plan}}. Intenta nuevamente o contáctanos.",
    activo: true,
  },
  {
    id: "cobro-automatico-exitoso",
    categoria: "Proceso de venta",
    nombre: "Cobro automático (suscripción) exitoso",
    asunto: "Cobramos tu suscripción ZPlash",
    cuerpo: "Hola {{nombre}}, cobramos {{monto}} correspondiente a tu suscripción del plan {{plan}}. Tu nuevo vencimiento es el {{fechaVencimiento}}.",
    activo: true,
  },
  {
    id: "cobro-automatico-fallido",
    categoria: "Proceso de venta",
    nombre: "Cobro automático (suscripción) fallido",
    asunto: "No pudimos cobrar tu suscripción",
    cuerpo: "Hola {{nombre}}, no pudimos cobrar tu suscripción del plan {{plan}}. Revisa tu método de pago para evitar que se venza.",
    activo: true,
  },
  {
    id: "vencimiento-proximo",
    categoria: "Proceso de venta",
    nombre: "Recordatorio de vencimiento próximo",
    asunto: "Tu plan ZPlash está por vencer",
    cuerpo: "Hola {{nombre}}, tu plan {{plan}} vence el {{fechaVencimiento}}. Renueva a tiempo para no perder tu beneficio.",
    activo: true,
  },
  {
    id: "reactivacion-plan-vencido",
    categoria: "Proceso de venta",
    nombre: "Reactivación de plan vencido",
    asunto: "Vuelve a ZPlash con un precio preferencial",
    cuerpo: "Hola {{nombre}}, tu plan {{plan}} está vencido. Tenemos un precio preferencial de reactivación esperándote.",
    activo: true,
  },
  {
    id: "servicio-adicional-confirmado",
    categoria: "Proceso de venta",
    nombre: "Compra de servicio adicional confirmada",
    asunto: "Confirmamos tu servicio adicional",
    cuerpo: "Hola {{nombre}}, confirmamos la compra de tu servicio adicional para la patente {{patente}} por {{monto}}.",
    activo: true,
  },
  {
    id: "oferta-promocional",
    categoria: "Ofertas y servicios",
    nombre: "Oferta promocional",
    asunto: "",
    cuerpo: "",
    activo: true,
  },
];
