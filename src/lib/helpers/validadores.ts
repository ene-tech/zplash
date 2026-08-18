export function normPlate(p: string | null | undefined): string {
  return (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Patente chilena: 6 caracteres, formato antiguo (2 letras + 4 números) o nuevo (4 letras + 2 números).
const PATENTE_REGEX = /^([A-Z]{2}[0-9]{4}|[A-Z]{4}[0-9]{2})$/;

export function isValidPatente(p: string | null | undefined): boolean {
  return PATENTE_REGEX.test(normPlate(p));
}

export const PATENTE_FORMATO_MSG =
  "Patente inválida. Debe tener 6 caracteres: 2 letras + 4 números (ej. AB1234) o 4 letras + 2 números (ej. ABCD12).";

export function limpiarRut(rut: string | null | undefined): string {
  return (rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Normaliza un RUT a formato canónico: separador de miles con puntos y dígito verificador al final tras un guion. */
export function formatRut(rut: string | null | undefined): string {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  const cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpoConPuntos}-${dv}`;
}

const RUT_REGEX = /^\d{1,3}(\.\d{3})*-[0-9K]$/;

export function isValidRut(rut: string | null | undefined): boolean {
  return RUT_REGEX.test(formatRut(rut));
}

export const RUT_FORMATO_MSG =
  "RUT inválido. Debe llevar separador de miles y el dígito verificador al final separado por un guion (ej. 12.345.678-9).";

/**
 * Estandariza un celular chileno a +569XXXXXXXX detectando las variantes más
 * comunes de carga: ya viene completo (con o sin "+", con espacios/guiones),
 * viene sin el "56" (9XXXXXXXX), o viene solo el número sin "9" ni "56"
 * (XXXXXXXX). Un "0" inicial (costumbre de marcar desde fijo) se descarta
 * antes de evaluar el patrón. Si no calza con ninguno (fijo, otro país,
 * dígitos de más/menos) se devuelve el original intacto para no perder el
 * dato — queda marcado como inválido por isValidTelefono para revisión manual.
 */
export function formatTelefono(tel: string | null | undefined): string {
  const original = (tel || "").trim();
  if (!original) return "";
  const d = original.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 11 && d.startsWith("569")) return "+" + d;
  if (d.length === 9 && d.startsWith("9")) return "+56" + d;
  if (d.length === 8) return "+569" + d;
  return original;
}

/**
 * Devuelve el teléfono solo si el operador realmente tipeó algo. Los inputs
 * precargan "+569" para que escriba únicamente los 8 dígitos (ver defaultValue
 * en ClientModal / OperadorNotFoundResult / ServiciosAdicionalesForm); si lo
 * deja intacto no hay teléfono, y guardarlo tal cual es peor que dejarlo vacío
 * porque la ficha queda con pinta de completa y nadie se lo vuelve a pedir al
 * cliente. Pasó de verdad: 358 fichas con telefono="+569" entre el 8 y el
 * 19-jul-2026 (ver scripts/limpiar-datos-clientes.ts).
 */
export function telefonoTipeado(raw: string | null | undefined): string {
  const t = (raw || "").trim();
  return /\d/.test(t.replace(/^\+?569?/, "")) ? t : "";
}

const TELEFONO_REGEX = /^\+569\d{8}$/;

export function isValidTelefono(tel: string | null | undefined): boolean {
  if (!tel || !tel.trim()) return true; // el teléfono es opcional
  return TELEFONO_REGEX.test(formatTelefono(tel));
}

export const TELEFONO_FORMATO_MSG =
  "Teléfono inválido. Debe ser un celular chileno: +569 seguido de 8 dígitos (ej. +56912345678).";

/**
 * Formato visual del celular para mostrarlo a operadores/clientes en tablas,
 * detalles y campos de edición: "+569 -XXXX XXXX". Se aplica solo a la
 * presentación — el valor guardado en la base de datos sigue siendo el
 * canónico "+569XXXXXXXX" de formatTelefono, sin espacios ni guion. Si el
 * teléfono no calza con el patrón chileno esperado (fijo, otro país, dato
 * corrupto) se devuelve intacto, igual que formatTelefono.
 */
export function fmtTelefono(tel: string | null | undefined): string {
  const formateado = formatTelefono(tel);
  if (!TELEFONO_REGEX.test(formateado)) return formateado;
  const resto = formateado.slice(4); // 8 dígitos tras "+569"
  return `+569 -${resto.slice(0, 4)} ${resto.slice(4)}`;
}

/**
 * Raíces de las direcciones que el operador inventa cuando el cliente no
 * quiere dar el correo pero el formulario lo exige: "noquieredarcorreo@",
 * "invitado@", "notienw@", más las casillas del propio local. Se buscan solo
 * en la parte local, y en forma de raíz para que aguanten los tipeos.
 * scripts/calidadDatosClientes.ts extiende esta lista para el saneamiento
 * histórico; acá está la que hace falta para no aceptar más.
 */
export const CORREO_RELLENO_RAICES = ["noquier", "noquis", "notien", "nosab", "noselo", "nomail", "nocorreo", "sincorreo", "sinmail", "invit", "limpiezaxx", "lavadoxx", "lavadotunel", "pasadotunel", "pasadatunel"];

export function esCorreoDeRelleno(email: string | null | undefined): boolean {
  const limpio = (email || "").trim().toLowerCase();
  if (!limpio) return false;
  const local = limpio.includes("@") ? limpio.slice(0, limpio.lastIndexOf("@")) : limpio;
  const token = local.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  return CORREO_RELLENO_RAICES.some((r) => token.includes(r)) || limpio.endsWith("@zplash.cl");
}

export const CORREO_RELLENO_MSG =
  "Ese correo es de relleno y el cliente nunca va a recibir nada. Si no quiere darlo, marca «El cliente no quiere dar correo».";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string | null | undefined): boolean {
  return EMAIL_REGEX.test((email || "").trim());
}

/**
 * Más estricto que isValidEmail: responde si una dirección tiene alguna
 * posibilidad real de recibir un correo del remitente automático. Se usa SOLO
 * en el motor de correo (@/lib/mailing/reglas/motor) para decidir si borrar el
 * email del cliente y que el operador lo vuelva a pedir — a propósito NO se
 * usa en los formularios: endurecer isValidEmail rechazaría en el registro
 * direcciones que hoy se aceptan, que es un cambio de otra naturaleza.
 *
 * Los dos casos extra que agarra, sacados de fallas reales de Resend en el log
 * (todas pasaban EMAIL_REGEX sin problema):
 *
 *  - Caracteres no-ASCII ("cardenas.matias.nuños@gmail.com",
 *    "israelgutiérrezf1982@gmail.com"). Mandar a esas direcciones exige la
 *    extensión SMTPUTF8, que los proveedores transaccionales no soportan:
 *    rebotan siempre, no es cosa de reintentar.
 *  - Punto al principio o al final de la parte local, o dos puntos seguidos
 *    ("cliente.@gmail.com") — inválido según RFC 5322.
 *
 * Ante la duda devuelve `true`: el costo de un falso negativo acá es borrarle
 * el correo bueno a un cliente, mucho peor que reintentar un envío que falla.
 */
export function esEmailEnviable(email: string | null | undefined): boolean {
  const limpio = (email || "").trim();
  if (!isValidEmail(limpio)) return false;
  if (/[^\x20-\x7E]/.test(limpio)) return false;
  const local = limpio.slice(0, limpio.lastIndexOf("@"));
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  return true;
}
