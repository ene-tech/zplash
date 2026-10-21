// Limpieza y validación de direcciones ANTES de entregarlas al proveedor de
// correo (Resend o SES, ver ./proveedor). Puro, sin dependencias: se prueba en
// direcciones.test.ts.
//
// Por qué existe además de esEmailEnviable (@/lib/helpers/validadores): la
// base trae direcciones tipeadas en el mesón con espacios ("juan perez@gmail.com",
// " ana@gmail.com "), mayúsculas, tildes y puntos colgando. Con Resend un rebote
// es cosmético; con SES la tasa de rebote sobre ~5% pone la cuenta en revisión
// y sobre ~10% la suspende. Así que: lo que se puede arreglar sin adivinar
// (espacios, mayúsculas) se arregla, y lo que no se manda.
//
// Lo que NO se intenta: corregir dominios ("gmial.com"), quitar puntos
// sobrantes o tildes. Eso es adivinar la dirección del cliente, y un error ahí
// le manda su correo a otra persona.

/** trim + sin espacios internos (incluye NBSP y tabs) + minúsculas. */
export function normalizarEmail(email: string | null | undefined): string {
  return (email || "").replace(/\s+/g, "").toLowerCase();
}

// atext de RFC 5322 (sin comillas: una parte local entre comillas no aparece
// en la base y ningún proveedor transaccional la maneja bien).
const LOCAL_PERMITIDO = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const ETIQUETA_DOMINIO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const NO_ASCII = /[^\x20-\x7e]/;

/**
 * Motivo por el que una dirección (ya normalizada, ver normalizarEmail) no se
 * puede mandar, o `null` si está bien. El texto queda en la bandeja de salida
 * (correos_automaticos.error), así que va en castellano para el operador.
 */
export function motivoEmailInvalido(email: string): string | null {
  if (!email) return "dirección vacía";
  const arrobas = email.split("@").length - 1;
  if (arrobas === 0) return "falta la @";
  if (arrobas > 1) return "tiene más de una @";
  const [local, dominio] = email.split("@");
  if (!local) return "falta lo que va antes de la @";
  if (!dominio) return "falta el dominio después de la @";
  // Tildes o ñ: exigen SMTPUTF8, que ni Resend ni SES soportan. Rebotan siempre.
  if (NO_ASCII.test(local)) return "tiene tildes, ñ u otros caracteres no permitidos antes de la @";
  if (NO_ASCII.test(dominio)) return "tiene tildes, ñ u otros caracteres no permitidos en el dominio";
  if (local.length > 64) return "la parte antes de la @ es demasiado larga";
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return "punto al inicio, al final o doble antes de la @";
  if (!LOCAL_PERMITIDO.test(local)) return "caracteres no permitidos antes de la @";
  if (dominio.length > 253) return "el dominio es demasiado largo";
  if (!dominio.includes(".")) return "el dominio no tiene punto";
  const etiquetas = dominio.split(".");
  if (etiquetas.some((e) => !e)) return "punto al inicio, al final o doble en el dominio";
  if (etiquetas.some((e) => e.length > 63 || !ETIQUETA_DOMINIO.test(e))) return "caracteres no permitidos en el dominio";
  // El TLD tiene que tener al menos una letra ("gmail.c0m" no, "xn--p1ai" sí).
  const tld = etiquetas[etiquetas.length - 1];
  if (tld.length < 2 || !/[a-z]/.test(tld)) return "el final del dominio no es válido";
  return null;
}

/** true si la dirección (ya normalizada) se puede entregar al proveedor. */
export function emailValido(email: string): boolean {
  return motivoEmailInvalido(email) === null;
}
