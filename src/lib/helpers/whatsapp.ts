import type { PlantillaWhatsapp, TextosBotWhatsapp } from "@/types";

// Contenido "de fábrica" de las respuestas del bot de WhatsApp — seed/
// fallback de ConfigGlobal.textosBotWhatsapp (ver @/lib/dataAccess/config y
// CONFIG_DEFAULT en este mismo directorio), mismo patrón que
// PRECIOS_DEFAULT/SERVICIOS_DEFAULT. Vive acá (no en
// @/lib/whatsapp/contenido, que ya importa de este barrel) para que
// lib/helpers/config.ts pueda usarlo sin generar un ciclo de imports. Los
// campos de descuento llevan placeholders {{...}} que reemplaza
// aplicarVariables al responder, con los valores reales tomados de
// ConfigGlobal.descuentoPrimeraVezValor/DiasValidez (editables en Web
// Settings → Menú Bot WhatsApp) — así el texto se puede editar sin tocar
// código y sigue mostrando el monto/plazo vigente mientras el admin no
// borre el placeholder.
export const TEXTOS_BOT_WHATSAPP_DEFAULT: TextosBotWhatsapp = {
  menuPrincipal: `¡Hola! 👋 Soy el asistente de ZPlash.

Elige una opción escribiendo el número, o envía tu *patente* para consultar tu plan:

1️⃣ Precios y Servicios
2️⃣ Quiero contratar el plan
3️⃣ Horario y ubicación
4️⃣ Hablar con una persona
5️⃣ Quiero un descuento para mi primera vez

Ejemplo: escribe *AB1234* para ver el estado de tu plan.`,

  textoPreciosIntro: `💰 *Precios*`,

  textoContratarPlan: `🚗 *Plan Full Túnel Ilimitado*

Puedes contratarlo directamente en el local, o desde este link:
https://zplash.cl/producto/plan-lavado-mensual-promocion/`,

  horarioUbicacion: `📍 *Ubicación*
Prieto Norte 71, Temuco

Google Maps: https://www.google.com/maps/search/?api=1&query=Prieto+Norte+71%2C+Temuco%2C+Chile
Waze: https://waze.com/ul?q=Prieto%20Norte%2071%2C%20Temuco%2C%20Chile&navigate=yes

🕒 *Horario*
Abierto todos los días
Lunes a viernes: 08:30 - 20:00
Sábado, domingo y festivos: 10:00 - 19:00`,

  contactoHumano: `Un miembro de nuestro equipo te va a contactar por este mismo WhatsApp. También puedes llamar al +56 9 3905 9611.`,

  mensajeNoEntendido: `No entendí tu mensaje 🤔

Escribe *menu* para ver las opciones, o envía tu *patente* para consultar tu plan.`,

  patenteNoEncontrada: `No encontramos ningún cliente con esa patente. Verifica que esté bien escrita (ej. AB1234) o escribe *3* para hablar con una persona.`,

  textoDescuentoInstrucciones: `🎉 ¡Bienvenido a ZPlash!

Por tu primera vez te regalamos {{monto}} de descuento en tu lavado, válido por {{dias}} días.

Para generar tu código, dime primero tu *nombre completo*.`,

  textoDescuentoPedirNombre: `Para generar tu código de descuento, dime tu *nombre completo*.`,

  textoDescuentoPedirPatente: `Gracias 🙌 Ahora dime la *patente* de tu vehículo (ej. AB1234).`,

  textoDescuentoPedirMail: `Perfecto. Por último, déjame tu *correo electrónico* para enviarte el código.`,

  textoDescuentoMailInvalido: `Ese correo no parece válido. Escríbelo de nuevo (ej. nombre@correo.com).`,

  textoDescuentoYaCliente: `Ya eres cliente ZPlash 🙌 Este descuento es solo para quienes nunca han venido. Escribe *1* para ver nuestros precios.`,

  textoDescuentoPatenteInvalida: `No reconocí esa patente. Escríbela de nuevo, por ejemplo: *AB1234*`,

  textoDescuentoConfirmacion: `🎉 ¡Listo! Tu código de descuento es *{{codigo}}*

Vale {{monto}} de descuento en tu próximo lavado. Válido hasta el {{fecha}}.

Muéstralo en el local al momento de pagar.`,

  patenteEstadoEncabezado: `🚗 *{{patente}}* — {{nombre}}`,
  patenteEstadoPlan: `Plan: {{plan}}`,
  patenteEstadoPlanVacio: `Sin plan`,
  patenteEstadoLinea: `Estado: {{estado}}`,
  patenteEstadoVencimiento: `Vencimiento: {{fecha}}`,
  patenteEstadoAvisoPorVencer: `⚠️ Vence en {{dias}} día(s).`,
  patenteEstadoAvisoVencido: `Tu plan no está vigente. Escribe *1* para ver precios de renovación.`,
  patenteEstadoCambioInvitacion: `✏️ ¿Cambiaste de vehículo? Escribe *cambio de patente* para actualizar tu patente registrada.`,

  textoCambioPatenteSinCliente: `Primero envía tu patente actual para identificar tu cuenta, y luego escribe *cambio de patente*.`,

  textoCambioPatentePedirNueva: `Escríbeme la *patente nueva* de tu vehículo (ej. AB1234).`,

  textoCambioPatenteInvalida: `No reconocí esa patente. Escríbela de nuevo (ej. AB1234), o escribe *cancelar* para salir.`,

  textoCambioPatenteEsLaMisma: `Esa ya es tu patente registrada. Escribe otra, o *cancelar* para salir.`,

  textoCambioPatenteYaExiste: `Ya hay un vehículo registrado con esa patente. Si crees que es un error, escribe *4* para hablar con una persona.`,

  textoCambioPatenteConfirmacion: `✅ Listo, registramos tu solicitud para cambiar tu patente a *{{patente}}*. El cambio se aplicará automáticamente cuando termine tu plan actual e inicie el próximo período.`,
};

/** Reemplaza placeholders `{{clave}}` por su valor en `vars` — usado tanto
 * por TextosBotWhatsapp (ver @/lib/whatsapp/router) como, a futuro, por
 * PlantillaWhatsapp/PlantillaCorreo cuando se conecte su envío automático.
 * Una clave sin valor en `vars` se reemplaza por string vacío en vez de
 * dejar el placeholder literal. */
export function aplicarVariables(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, clave: string) => vars[clave] ?? "");
}

/** Convierte un nombre libre (el de `PlantillaWhatsapp.nombre`, o cualquier
 * texto) al formato que exige Meta para el nombre de un template: solo
 * minúsculas, dígitos y guion bajo, sin tildes ni espacios. Usado por el
 * generador "Copiar para Meta" en WebSettingsWhatsappTab para sugerir
 * `metaNombre` a partir de la situación ya definida en la app. */
export function slugMetaTemplate(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Convierte el cuerpo de una PlantillaWhatsapp (placeholders con nombre,
 * `{{nombre}}`, `{{patente}}`, etc.) al formato posicional numerado
 * (`{{1}}`, `{{2}}`, ...) que Meta exige al crear el template en Meta
 * Business Manager. Devuelve también `variables`, el orden de aparición de
 * cada placeholder — el mismo orden que corresponde guardar en
 * `PlantillaWhatsapp.metaVariables` para que enviarMensajePlantilla arme los
 * parámetros posicionales correctos. Una misma variable repetida más de una
 * vez en el texto reutiliza su número. */
export function convertirVariablesMeta(mensaje: string): { texto: string; variables: string[] } {
  const variables: string[] = [];
  const numeroDeVariable = new Map<string, number>();
  const texto = mensaje.replace(/\{\{(\w+)\}\}/g, (_, clave: string) => {
    let n = numeroDeVariable.get(clave);
    if (!n) {
      variables.push(clave);
      n = variables.length;
      numeroDeVariable.set(clave, n);
    }
    return `{{${n}}}`;
  });
  return { texto, variables };
}

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
    metaAprobado: false,
  },
  {
    id: "wa-renovacion-confirmada",
    categoria: "Proceso de venta",
    nombre: "Confirmación de renovación de plan",
    mensaje: "Hola {{nombre}}, renovamos tu plan {{plan}} para la patente {{patente}}. Tu nuevo vencimiento es el {{fechaVencimiento}}.",
    activo: true,
    metaAprobado: false,
  },
  {
    id: "wa-pago-rechazado",
    categoria: "Proceso de venta",
    nombre: "Pago rechazado",
    mensaje: "Hola {{nombre}}, no pudimos procesar el pago de {{monto}} para tu plan {{plan}}. ¿Intentamos de nuevo?",
    activo: true,
    metaAprobado: false,
  },
  {
    id: "wa-cobro-automatico-exitoso",
    categoria: "Proceso de venta",
    nombre: "Cobro automático (suscripción) exitoso",
    mensaje: "Hola {{nombre}}, cobramos {{monto}} de tu suscripción del plan {{plan}}. Nuevo vencimiento: {{fechaVencimiento}}.",
    activo: true,
    metaAprobado: false,
  },
  {
    id: "wa-cobro-automatico-fallido",
    categoria: "Proceso de venta",
    nombre: "Cobro automático (suscripción) fallido",
    mensaje: "Hola {{nombre}}, no pudimos cobrar tu suscripción del plan {{plan}}. Revisa tu método de pago para no perderla.",
    activo: true,
    metaAprobado: false,
  },
  {
    id: "wa-vencimiento-proximo",
    categoria: "Proceso de venta",
    nombre: "Recordatorio de vencimiento próximo",
    mensaje: "Hola {{nombre}}, tu plan {{plan}} vence el {{fechaVencimiento}}. ¡Renueva a tiempo!",
    activo: true,
    metaAprobado: false,
  },
  {
    id: "wa-reactivacion-plan-vencido",
    categoria: "Proceso de venta",
    nombre: "Reactivación de plan vencido",
    mensaje: "Hola {{nombre}}, tu plan {{plan}} está vencido. Tenemos un precio preferencial de reactivación para ti.",
    activo: true,
    metaAprobado: false,
  },
  {
    id: "wa-servicio-adicional-confirmado",
    categoria: "Proceso de venta",
    nombre: "Compra de servicio adicional confirmada",
    mensaje: "Hola {{nombre}}, confirmamos tu servicio adicional para la patente {{patente}} por {{monto}}.",
    activo: true,
    metaAprobado: false,
  },
  {
    id: "wa-oferta-promocional",
    categoria: "Ofertas y servicios",
    nombre: "Oferta promocional",
    mensaje: "",
    activo: true,
    metaAprobado: false,
  },
  {
    id: "wa-plan-review-google",
    categoria: "Fidelización",
    nombre: "Solicitud de reseña Google (cliente con plan)",
    mensaje:
      "¡Hola {{nombre}}! Gracias por confiar en ZPlash con tu plan {{plan}} 🚗✨. ¿Nos regalas una reseña de 5 estrellas en Google? Nos ayuda muchísimo: https://g.page/r/CAMBIAR-ESTE-LINK/review",
    activo: true,
    metaAprobado: false,
    metaNombre: "mensaje_cliente_plan_review_google",
  },
];
