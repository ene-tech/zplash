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
6️⃣ Dejar mi opinión del lavado

Ejemplo: escribe *AB1234* para ver el estado de tu plan.`,

  textoPreciosIntro: `💰 *Precios*`,

  textoPreciosPedirTamano: `Para cotizarte bien, primero dime el tamaño de tu vehículo 🚙`,

  textoPreciosTamanoInvalido: `No reconocí ese tamaño 🤔 Responde con el número (1 a 4) o la letra (S, M, L, XL). También puedes escribir *menu* para volver.`,

  textoContratarPlan: `🚗 *Plan X5 Full Túnel*

Puedes contratarlo directamente en el local, o desde este link:
https://zplash.cl/servicios/plan-mensual`,

  horarioUbicacion: `📍 *Ubicación*
Prieto Norte 71, Temuco

Google Maps: https://www.google.com/maps/search/?api=1&query=Prieto+Norte+71%2C+Temuco%2C+Chile
Waze: https://waze.com/ul?q=Prieto%20Norte%2071%2C%20Temuco%2C%20Chile&navigate=yes

🕒 *Horario*
Abierto todos los días
Lunes a viernes: 08:30 - 20:00
Sábado, domingo y festivos: 10:00 - 19:00`,

  contactoHumano: `Un miembro de nuestro equipo te va a contactar por este mismo WhatsApp. También puedes llamar al +56 9 3905 9611.`,

  patenteNoEncontrada: `No encontramos ningún cliente con esa patente. Verifica que esté bien escrita (ej. AB1234) o escribe *4* para hablar con una persona.`,

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
  // Manda al 2 y no al 1: la opción 1 es la lista de precios (muestra el
  // valor del plan, pero sin link), y la 2 arma el checkout con la patente
  // del cliente ya puesta cuando la conversación está enlazada a su ficha
  // (ver textoContratarPlan en @/lib/whatsapp/router). Al vencido —que es
  // justo al que se quiere recuperar— se le da el camino corto.
  patenteEstadoAvisoVencido: `Tu plan no está vigente. Escribe *2* para renovarlo.`,
  patenteEstadoCambioInvitacion: `✏️ ¿Cambiaste de vehículo? Escribe *cambio de patente* para actualizar tu patente registrada.`,

  textoCambioPatenteSinCliente: `Primero envía tu patente actual para identificar tu cuenta, y luego escribe *cambio de patente*.`,

  textoCambioPatentePedirNueva: `Escríbeme la *patente nueva* de tu vehículo (ej. AB1234).`,

  textoCambioPatenteInvalida: `No reconocí esa patente. Escríbela de nuevo (ej. AB1234), o escribe *cancelar* para salir.`,

  textoCambioPatenteEsLaMisma: `Esa ya es tu patente registrada. Escribe otra, o *cancelar* para salir.`,

  textoCambioPatenteYaExiste: `Ya hay un vehículo registrado con esa patente. Si crees que es un error, escribe *4* para hablar con una persona.`,

  textoCambioPatenteConfirmacion: `✅ Listo, registramos tu solicitud para cambiar tu patente a *{{patente}}*. El cambio se aplicará automáticamente cuando termine tu plan actual e inicie el próximo período.`,

  textoOpinionPedirNota: `¿Cómo estuvo tu lavado? 🚗✨

Ponnos una nota del *1 al 7*. Responde solo con el número.`,

  textoOpinionNotaInvalida: `Necesito un número del *1 al 7* (por ejemplo: *6*). También puedes escribir *menu* para volver.`,

  // El link de reseña hay que pegarlo en Web Settings → Menú Bot WhatsApp:
  // sale del perfil de Google Business del local ("Pedir reseñas" → copiar
  // enlace). Mientras diga CAMBIAR-ESTE-LINK el link manda a una página rota.
  textoOpinionGracias: `¡Gracias por tu nota! 🙌 Nos alegra que te haya gustado.

¿Nos ayudas con una reseña en Google? Nos sirve muchísimo:
https://g.page/r/CAMBIAR-ESTE-LINK/review`,

  textoOpinionPedirComentario: `Gracias por la nota, y perdona que no diéramos el ancho 🙏

¿Qué salió mal? Cuéntame en un mensaje y lo revisamos.`,

  textoOpinionGraciasReclamo: `Gracias por contarnos 🙏 Ya le avisamos al equipo y alguien te va a escribir por acá.`,
};

/** Desde qué nota (escala 1-7) una opinión se considera buena: cierra
 * agradeciendo y pidiendo reseña en vez de preguntar qué salió mal. */
export const OPINION_NOTA_BUENA = 6;

/** Reemplaza placeholders `{{clave}}` por su valor en `vars` — usado tanto
 * por TextosBotWhatsapp (ver @/lib/whatsapp/router) como, a futuro, por
 * PlantillaWhatsapp/PlantillaCorreo cuando se conecte su envío automático.
 * Una clave sin valor en `vars` se reemplaza por string vacío en vez de
 * dejar el placeholder literal. */
export function aplicarVariables(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, clave: string) => {
    // Una clave que ni siquiera existe en "vars" es un typo en la plantilla,
    // no un valor opcional vacío: construirVariables (@/lib/whatsapp/reglas/
    // motor) devuelve SIEMPRE todas sus claves, con "" cuando no aplican, así
    // que "clave in vars" distingue las dos cosas. Se avisa porque si no, un
    // typo sale como texto mudo sin que nada falle: la campaña del 27-ago-2026
    // se mandó a 387 clientes diciendo "por solo $ —" porque la plantilla
    // escribía una variable que el builder no conoce.
    if (!(clave in vars)) console.warn("aplicarVariables: variable desconocida en la plantilla, sale vacía:", clave);
    return vars[clave] ?? "";
  });
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

// Vocabulario del menú del bot. Vive acá y no en @/lib/whatsapp/router porque
// ese archivo importa la capa de datos (server-only) y esto lo necesita
// también el navegador, para clasificar por dónde entró un prospecto que
// escribió y nunca dejó ficha (ver interesDeMensajes). El router lo importa de
// acá: una sola definición de "qué significa escribir 5".
// Las frases van SIN tilde y en minúscula: se comparan contra el texto ya
// normalizado por normalizarTextoBot, que se las saca. Las de más de un
// carácter matchean como palabra completa dentro del mensaje ("descuento
// AB1234" entra al descuento, "quiero hablar con una persona" al humano);
// los números solo valen si el mensaje ES el número, para que "quiero 1
// lavado" no se lea como la opción 1.
export const OPCIONES_BOT = {
  precios: new Set(["1", "precios", "precio", "servicios"]),
  contratar_plan: new Set(["2", "contratar", "quiero el plan", "quiero contratar el plan"]),
  // Los manda la propia web con el texto ya puesto (ver RenovacionLegacyCard
  // y las cards de detailing en @/components/cliente): son la intención más
  // clara que llega por este canal y hasta ago-2026 se contestaban con el
  // menú genérico. Ninguna de las dos se puede resolver sola —la renovación
  // legacy la cobra WooCommerce y el detailing se agenda a mano— así que las
  // dos avisan a Gerencia como la opción "hablar con una persona".
  renovacion_auto: new Set(["renovacion automatica", "renovacion automática", "cancelar mi renovacion", "cambiar mi tarjeta"]),
  agendar: new Set(["agendar", "reservar hora", "tomar hora"]),
  horario: new Set(["3", "horario", "horarios", "ubicacion", "direccion"]),
  humano: new Set(["4", "humano", "ayuda", "persona", "hablar con alguien", "ejecutivo"]),
  descuento: new Set(["5", "descuento", "dscto"]),
  cambio_patente: new Set(["cambio de patente", "cambio patente", "cambiar patente"]),
  // Lo manda el QR del túnel con el texto ya puesto ("Hola, quiero dejar mi
  // opinion del lavado"). Es además el que abre la ventana de servicio de
  // 24h de Meta, dentro de la cual los templates UTILITY no se cobran.
  opinion: new Set(["6", "opinion", "reclamo", "queja", "sugerencia"]),
} as const;

export type InteresBot = keyof typeof OPCIONES_BOT;

export const ETIQUETA_INTERES: Record<InteresBot, string> = {
  precios: "Preguntó precios",
  contratar_plan: "Quiso contratar el plan",
  renovacion_auto: "Quiere gestionar su renovación automática",
  agendar: "Quiso agendar un servicio",
  horario: "Preguntó horario o dirección",
  humano: "Pidió hablar con una persona",
  descuento: "Pidió el descuento",
  cambio_patente: "Cambio de patente",
  opinion: "Dejó su opinión",
};

/**
 * Qué vino a buscar quien escribió, mirando todo lo que mandó. Devuelve el
 * interés de MAYOR intención comercial de entre los que tocó, no el último:
 * alguien que preguntó horario y después pidió el descuento es un prospecto
 * de descuento, y ese es el orden en el que conviene trabajarlos.
 */
const PRIORIDAD_INTERES: InteresBot[] = [
  "descuento",
  "contratar_plan",
  "renovacion_auto",
  "agendar",
  "precios",
  "cambio_patente",
  "humano",
  // Sobre "horario" y bajo "humano": no es intención de compra, pero una
  // queja pendiente pesa más para trabajar a ese cliente que una consulta
  // de dirección.
  "opinion",
  "horario",
];

/**
 * Minúsculas, sin tildes y sin puntuación, con un espacio a cada lado. Los
 * espacios de los bordes son los que dejan buscar palabras completas con un
 * `includes(" persona ")` sin armar una regex por frase — y sin que "persona"
 * matchee dentro de "personalizado".
 */
export function normalizarTextoBot(texto: string): string {
  const limpio = (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${limpio} `;
}

/**
 * Qué opción del menú pidió un mensaje suelto, o null si no calza con
 * ninguna. Cuando toca más de una (p.ej. "precios y quiero el descuento")
 * gana la de mayor intención comercial, mismo criterio que interesDeMensajes.
 */
export function opcionDeTexto(texto: string): InteresBot | null {
  const t = normalizarTextoBot(texto);
  const exacto = t.trim();
  return (
    PRIORIDAD_INTERES.find((i) =>
      [...OPCIONES_BOT[i]].some((frase) => {
        const f = normalizarTextoBot(frase).trim();
        return f.length === 1 ? exacto === f : t.includes(` ${f} `);
      })
    ) ?? null
  );
}

export function interesDeMensajes(textosEntrantes: string[]): InteresBot | null {
  const encontrados = new Set(textosEntrantes.map(opcionDeTexto));
  return PRIORIDAD_INTERES.find((i) => encontrados.has(i)) ?? null;
}
