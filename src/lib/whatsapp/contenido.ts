import { CATEGORIA_DETAILING, fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "@/components/cliente/types";
import { TAMANOS_VEHICULO, TAMANO_DESCRIPCION, TAMANO_EJEMPLOS, TAMANO_LABEL, type TamanoVehiculo } from "@/types";

/**
 * Lee la respuesta del cliente al paso "tamaño" del flujo de precios.
 * Acepta la letra (S/M/L/XL) o el número de la lista (1-4), que es como se le
 * ofrecen en textoPedirTamano — un cliente en WhatsApp responde de las dos
 * formas. Devuelve null si no calza con ninguna, para repreguntar sin avanzar.
 */
export function parsearTamano(texto: string): TamanoVehiculo | null {
  const t = texto.trim().toLowerCase();
  const porLetra = TAMANOS_VEHICULO.find((x) => x === t);
  if (porLetra) return porLetra;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= TAMANOS_VEHICULO.length ? TAMANOS_VEHICULO[n - 1] : null;
}

/**
 * Pregunta por el tamaño del vehículo antes de cotizar. La lista se genera
 * desde TAMANOS_VEHICULO y no es texto libre editable, por lo mismo que la
 * lista de precios: si mañana se agrega un tamaño, el bot lo ofrece solo.
 * `intro` sí es editable desde Web Settings.
 */
export function textoPedirTamano(intro: string): string {
  const lineas = [intro, ``];
  TAMANOS_VEHICULO.forEach((t, i) => {
    lineas.push(`*${i + 1}* · ${TAMANO_LABEL[t]} — ${TAMANO_DESCRIPCION[t]}`);
    lineas.push(`   _${TAMANO_EJEMPLOS[t]}_`);
    lineas.push(``);
  });
  lineas.push(`Responde con el número o la letra (ej. *2* o *M*).`);
  return lineas.join("\n");
}

/**
 * Lista de precios del bot, armada desde getPreciosPublicos() — la MISMA
 * fuente que pinta la landing (ver TiposLavadoTab y DetailingTab), para que
 * el precio que cotiza el bot no se pueda desviar del que muestra la web ni
 * del que cobra /api/pagos/webpay/crear. Antes esta función leía
 * PRECIOS_DEFAULT y PRECIO_LAVADO_UNICO, o sea constantes compiladas: el bot
 * quedó cotizando precios viejos cada vez que el admin cambió uno.
 *
 * `tamano` solo afecta a los servicios con precio diferenciado (hoy Lavado
 * Completo Detailing, ver PreciosTamano); el resto del catálogo es plano y se
 * muestra igual para todos.
 */
export function textoPrecios(p: PreciosPublicos, tamano: TamanoVehiculo, intro: string): string {
  const lineas = [intro, ``];

  lineas.push(`🚗 *Lavado Full Túnel*`);
  lineas.push(`${fmtCLP(p.lavadoUnico.precio)} — pago único, sin plan`, ``);

  lineas.push(`⭐ *Plan Mensual Ilimitado*`);
  // Mismo criterio que la card de la landing: el precio que se muestra grande
  // es el de 1ra contratación, y el normal solo aparece cuando es más caro.
  const normal = p.plan.precio > p.planPrimera.precio ? ` (normal ${fmtCLP(p.plan.precio)})` : "";
  lineas.push(`${fmtCLP(p.planPrimera.precio)} / mes${normal}`);
  lineas.push(`_Precio de 1ra contratación o renovando antes del vencimiento._`, ``);

  lineas.push(`💨 *Zona Aspirado Autoservicio*`);
  lineas.push(`${fmtCLP(p.zonaAspirado.precio)}`, ``);

  lineas.push(`🎟️ *Pack de ${p.tickets.cantidadMinima} Tickets o más*`);
  lineas.push(`${fmtCLP(p.tickets.precioBase)} (${fmtCLP(p.tickets.precioUnitario)} c/u) · válido ${p.tickets.vigenciaDias} días`, ``);

  if (p.servicios.length) {
    lineas.push(`✨ *Servicios de Detailing*`);
    lineas.push(`_Precios para vehículo ${TAMANO_LABEL[tamano]} — ${TAMANO_DESCRIPCION[tamano]}_`, ``);

    // Mismo orden que DetailingTab: Lavado Completo Detailing primero, el
    // resto en el orden en que venga el catálogo.
    const categorias = Array.from(new Set(p.servicios.map((s) => s.categoria || "Otros"))).sort((a, b) =>
      a === CATEGORIA_DETAILING ? -1 : b === CATEGORIA_DETAILING ? 1 : 0
    );
    for (const cat of categorias) {
      lineas.push(`*${cat}*`);
      for (const s of p.servicios.filter((s) => (s.categoria || "Otros") === cat)) {
        lineas.push(`${s.nombre}: ${fmtCLP(s.preciosTamano?.[tamano] ?? s.precio)}`);
      }
      lineas.push(``);
    }
  }

  lineas.push(`Escribe *menu* para volver a las opciones.`);
  return lineas.join("\n");
}
