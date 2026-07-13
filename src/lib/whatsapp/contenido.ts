import {
  fmtCLP,
  PRECIOS_DEFAULT,
  PRECIO_LAVADO_UNICO,
  SERVICIOS_ADICIONALES,
} from "@/lib/helpers";

export const MENU_PRINCIPAL = `¡Hola! 👋 Soy el asistente de ZPlash.

Elige una opción escribiendo el número, o envía tu *patente* para consultar tu plan:

1️⃣ Precios y Servicios
2️⃣ Quiero contratar el plan
3️⃣ Horario y ubicación
4️⃣ Hablar con una persona
5️⃣ Quiero un descuento para mi primera vez

Ejemplo: escribe *AB1234* para ver el estado de tu plan.`;

export const DESCUENTO_PRIMERA_VEZ_VALOR = 1000;
export const DESCUENTO_PRIMERA_VEZ_DIAS_VALIDEZ = 7;

export const TEXTO_DESCUENTO_INSTRUCCIONES = `🎉 ¡Bienvenido a ZPlash!

Por tu primera vez te regalamos ${fmtCLP(DESCUENTO_PRIMERA_VEZ_VALOR)} de descuento en tu lavado.

Escribe *descuento* seguido de tu patente para recibir tu código. Ejemplo: *descuento AB1234*

El código queda vigente por ${DESCUENTO_PRIMERA_VEZ_DIAS_VALIDEZ} días.`;

export const TEXTO_DESCUENTO_YA_CLIENTE = `Ya eres cliente ZPlash 🙌 Este descuento es solo para quienes nunca han venido. Escribe *1* para ver nuestros precios.`;

export const TEXTO_DESCUENTO_PATENTE_INVALIDA = `No reconocí esa patente. Escribe *descuento* seguido de tu patente, por ejemplo: *descuento AB1234*`;

export function textoDescuentoConfirmacion(codigo: string, fechaCaducidadISO: string): string {
  const fecha = new Date(fechaCaducidadISO).toLocaleDateString("es-CL");
  return `🎉 ¡Listo! Tu código de descuento es *${codigo}*

Vale ${fmtCLP(DESCUENTO_PRIMERA_VEZ_VALOR)} de descuento en tu próximo lavado. Válido hasta el ${fecha}.

Muéstralo en el local al momento de pagar.`;
}

export const SERVICIOS_IMAGEN_PATH = "/servicios-precios.jpg";

export const PLAN_IMAGEN_PATH = "/plan-mensual.jpg";

export const TEXTO_CONTRATAR_PLAN = `🚗 *Plan Full Túnel Ilimitado*

Puedes contratarlo directamente en el local, o desde este link:
https://zplash.cl/producto/plan-lavado-mensual-promocion/`;

export const HORARIO_UBICACION = `📍 *Ubicación*
Prieto Norte 71, Temuco

Google Maps: https://www.google.com/maps/search/?api=1&query=Prieto+Norte+71%2C+Temuco%2C+Chile
Waze: https://waze.com/ul?q=Prieto%20Norte%2071%2C%20Temuco%2C%20Chile&navigate=yes

🕒 *Horario*
Abierto todos los días
Lunes a viernes: 08:30 - 20:00
Sábado, domingo y festivos: 10:00 - 19:00`;

export const CONTACTO_HUMANO = `Un miembro de nuestro equipo te va a contactar por este mismo WhatsApp. También puedes llamar al +56 9 3905 9611.`;

export const MENSAJE_NO_ENTENDIDO = `No entendí tu mensaje 🤔

Escribe *menu* para ver las opciones, o envía tu *patente* para consultar tu plan.`;

export const PATENTE_NO_ENCONTRADA = `No encontramos ningún cliente con esa patente. Verifica que esté bien escrita (ej. AB1234) o escribe *3* para hablar con una persona.`;

export function textoPrecios(): string {
  const lineas = [`💰 *Precios*`, ``];

  for (const [plan, precio] of Object.entries(PRECIOS_DEFAULT)) {
    lineas.push(`${plan}: ${fmtCLP(precio.promo)} (normal ${fmtCLP(precio.normal)})`);
  }

  lineas.push(``, `Lavado único: ${fmtCLP(PRECIO_LAVADO_UNICO)}`, ``, `*Servicios adicionales*`);
  for (const s of SERVICIOS_ADICIONALES) {
    lineas.push(`${s.nombre}: ${fmtCLP(s.precio)}`);
  }

  return lineas.join("\n");
}
