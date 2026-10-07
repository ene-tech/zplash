// Marca de origen (utm_*) para los links a zplash.cl que salen por WhatsApp,
// correo o QR. Sin esto PostHog ve esas visitas como "Directo": ni WhatsApp
// ni los clientes de correo mandan referrer, así que no se podía saber qué
// canal trae ventas. Un link que ya trae utm_source no se toca (lo marcó a
// mano quien armó la campaña), y /b/ (baja de SMS) queda fuera: no es una
// visita que interese medir.

export interface Origen {
  source: string;
  medium: string;
  campaign?: string;
}

function parametros(o: Origen): string {
  return (
    `utm_source=${encodeURIComponent(o.source)}&utm_medium=${encodeURIComponent(o.medium)}` +
    (o.campaign ? `&utm_campaign=${encodeURIComponent(o.campaign)}` : "")
  );
}

// El lookahead corta "https://zplash.cl.otro.com" y "zplash.cl:443", que no
// son links nuestros; un punto final de oración ("...en https://zplash.cl.") sí.
const LINK_ZPLASH = /https:\/\/(?:www\.)?zplash\.cl(?![\w-]|\.\w|:\d)(?:\/[^\s"'<>]*)?/g;

/** Agrega el origen a un link a zplash.cl; cualquier otro link vuelve igual. */
export function conOrigen(url: string, o: Origen): string {
  if (!/^https:\/\/(?:www\.)?zplash\.cl(?:\/|$)/.test(url)) return url;
  // ";" cubre el "&amp;" de los href en HTML de correo.
  if (/[?&;]utm_source=/.test(url) || /^https:\/\/(?:www\.)?zplash\.cl\/b\//.test(url)) return url;
  // Puntuación final del texto ("...aquí: https://zplash.cl/pagar.") no es
  // parte del link: se deja afuera para no meterla en el último parámetro.
  const [, base, cola] = url.match(/^(.*?)([.,;:!?)*_]*)$/) ?? [, url, ""];
  const [sinAncla, ancla] = base!.split("#", 2);
  const sep = sinAncla!.includes("?") ? "&" : "?";
  return `${sinAncla}${sep}${parametros(o)}${ancla !== undefined ? `#${ancla}` : ""}${cola}`;
}

/** Agrega el origen a cada link a zplash.cl dentro de un texto o HTML. */
export function linksConOrigen(texto: string, o: Origen): string {
  return texto.replace(LINK_ZPLASH, (url) => conOrigen(url, o));
}

/** Para el valor de una variable de plantilla de Meta que va pegada al final
 * de un link (`https://zplash.cl/?ref={{patente}}`): el texto del template ya
 * está aprobado, así que el origen viaja dentro del valor de la variable. */
export function sufijoOrigen(o: Origen): string {
  return `&${parametros(o)}`;
}

/** Posiciones (0-based, en el orden de `metaVariables`) de las variables de
 * una plantilla que van pegadas al final de un link a zplash.cl. Si el
 * conteo de placeholders del texto no calza con `metaVariables` no se puede
 * saber cuál es cuál, y no se marca ninguna: mejor sin origen que con un
 * "&utm_..." colgando en medio del saludo. */
export function posicionesVariableEnLink(mensaje: string, cantidadVariables: number): number[] {
  const placeholders = [...mensaje.matchAll(/\{\{\w+\}\}/g)];
  if (placeholders.length !== cantidadVariables) return [];
  return placeholders.flatMap((m, i) => {
    const antes = mensaje.slice(0, m.index).match(/\S*$/)![0];
    const despues = mensaje.slice(m.index! + m[0].length);
    const pegadaAlLink = /^https:\/\/(?:www\.)?zplash\.cl\/\S*[?&=]$/.test(antes);
    const cierraElLink = /^(?:\s|$|[.,;:!?)])/.test(despues);
    return pegadaAlLink && cierraElLink ? [i] : [];
  });
}
