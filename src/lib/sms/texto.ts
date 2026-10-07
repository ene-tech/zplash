// Reglas de texto de un SMS, sin dependencias de servidor: las usa el envío
// (@/lib/sms/enviar) y también el contador de Mensajes Únicos en el navegador,
// para que lo que ve el admin sea exactamente lo que se cobra.
//
// Un SMS en alfabeto GSM-7 lleva 160 caracteres; uno solo con un emoji o una
// "á" pasa a UCS-2 y baja a 70, o sea que cuesta el doble o el triple por el
// mismo texto. Por eso normalizarSms deja el texto en GSM-7: saca tildes que
// GSM-7 no tiene (sí tiene ñ, é, ü) y borra emojis. Con más de un segmento,
// cada uno lleva 153 (los 7 restantes son la cabecera que los une).

const LIMITE_UN_SEGMENTO = 160;
const POR_SEGMENTO = 153;
// LabsMobile con long=1 acepta hasta 459 caracteres (3 segmentos).
export const MAX_SEGMENTOS_SMS = 3;

// Caracteres del alfabeto GSM 03.38 básico (1 posición cada uno).
const GSM_BASICO = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
);
// Extensión GSM: entran, pero cada uno ocupa 2 posiciones (escape + carácter).
const GSM_EXTENDIDO = new Set("^{}\\[~]|€");

const REEMPLAZOS: Record<string, string> = {
  á: "a", í: "i", ó: "o", ú: "u", Á: "A", Í: "I", Ó: "O", Ú: "U", â: "a", ê: "e", î: "i", ô: "o", û: "u",
  "“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-", "…": "...", " ": " ",
};

/** Deja el texto dentro de GSM-7: cambia tildes por su letra sin tilde y
 * borra lo que no tiene equivalente (emojis, símbolos), sin dejar espacios dobles. */
export function normalizarSms(texto: string): string {
  let salida = "";
  for (const ch of texto) {
    const c = REEMPLAZOS[ch] ?? ch;
    if ([...c].every((x) => GSM_BASICO.has(x) || GSM_EXTENDIDO.has(x))) salida += c;
  }
  return salida
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Largo en posiciones GSM-7 (los caracteres extendidos cuentan doble). */
export function largoSms(texto: string): number {
  let n = 0;
  for (const ch of texto) n += GSM_EXTENDIDO.has(ch) ? 2 : 1;
  return n;
}

/** Segmentos que cobra el proveedor por un texto ya normalizado. */
export function segmentosSms(texto: string): number {
  const largo = largoSms(texto);
  if (largo <= LIMITE_UN_SEGMENTO) return 1;
  return Math.ceil(largo / POR_SEGMENTO);
}

// Pie con el link de baja que exige la ley del consumidor (art. 28 B de la Ley
// 19.496) en toda comunicación promocional. El código es por mensaje: ver
// codigoBaja en @/db/schema/sms y la página /b/[codigo].
export const LARGO_CODIGO_BAJA = 6;

export function pieBajaSms(codigo: string): string {
  return `Baja: zplash.cl/b/${codigo}`;
}

/** Texto final tal como llega al teléfono: el del admin normalizado, en una
 * sola línea, + el pie de baja. Los saltos de línea no llegan: probado en
 * oct-2026 con LabsMobile a Chile, tanto LF como CR+LF llegaron borrados y el
 * pie quedaba pegado a la última palabra. Por eso se juntan acá (y así la
 * vista previa de Mensajes Únicos muestra lo mismo que ve el cliente), con un
 * punto antes del pie si el texto no termina en puntuación. */
export function textoFinalSms(texto: string, codigoBaja: string): string {
  const cuerpo = normalizarSms(texto).replace(/\s*\r?\n\s*/g, " ");
  if (!cuerpo) return pieBajaSms(codigoBaja);
  return `${cuerpo}${/[.!?]$/.test(cuerpo) ? "" : "."} ${pieBajaSms(codigoBaja)}`;
}
