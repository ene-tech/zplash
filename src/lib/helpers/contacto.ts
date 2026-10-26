import type { Cliente, Modulo } from "@/types";
import { esNombreVacio } from "./clientes";
import { esEmailEnviable, isValidTelefono } from "./validadores";

// Aviso del mesón "a este cliente no le llegan los mensajes" (pedido del dueño,
// 26-oct-2026): cuando un correo o un SMS no le llega, la próxima vez que pasa
// el auto el mesón sugiere actualizar el dato. Corregir un dato que ya existe
// (no solo completar uno vacío) lo pueden hacer Jeny, Administración y
// Gerencia; el resto de los operadores no ve el aviso.

/** Perfiles que, sin el módulo Clientes, pueden corregir el contacto desde el mesón. */
export const PERFILES_CORRIGEN_CONTACTO = ["Jeny", "Administración", "Gerencia"];

export function puedeCorregirContacto(modulos: Modulo[], nombre?: string): boolean {
  return modulos.includes("clientes") || (!!nombre && PERFILES_CORRIGEN_CONTACTO.includes(nombre));
}

/** Nombre que no es de nadie: vacío, "Sin nombre" de la carga por Excel o el
 * "Invitado" con que el mesón da de alta a un auto apurado (577 fichas al
 * 26-oct-2026). Las campañas lo saludan tal cual: "Invitado, lava tu auto…". */
export function esNombrePlaceholder(nombre: string | undefined | null): boolean {
  return esNombreVacio(nombre) || nombre!.trim().toLowerCase() === "invitado";
}

// Fallas de LabsMobile que son de la cuenta y no del número del cliente: sin
// saldo, red, credenciales, texto largo. No dicen nada del celular.
const ERROR_SMS_DE_CUENTA = /credit|Error de red|LABSMOBILE|respuesta inválida|demasiado largo|código de baja/i;

export function esErrorSmsDeCuenta(error: string | null | undefined): boolean {
  return ERROR_SMS_DE_CUENTA.test(error || "");
}

// Al revés que en SMS, de los errores de correo solo cuentan los que culpan a
// la dirección (la rechazó nuestro filtro o el proveedor): una caída de
// Resend, el límite por segundo o una llave faltante no dicen nada del correo.
const ERROR_CORREO_DE_DIRECCION = /dirección no enviable|invalid `to`|invalid.*(address|recipient)/i;

export function esErrorCorreoDeDireccion(error: string | null | undefined): boolean {
  return ERROR_CORREO_DE_DIRECCION.test(error || "");
}

/** Qué dato de contacto hay que actualizar y por qué (texto para el operador). Vacío = nada. */
export type FallasContacto = { nombre?: string; telefono?: string; email?: string };

/**
 * `ultimos` resume los últimos envíos al dato que tiene hoy la ficha (ver
 * fallasContactoCliente en @/lib/dataAccess): un rebote de un correo viejo no
 * cuenta si el correo ya se cambió.
 */
export function fallasContacto(
  c: Pick<Cliente, "nombre" | "telefono" | "email">,
  ultimos: { correoFallido?: boolean; correoSuprimido?: boolean; smsFallido?: boolean } = {}
): FallasContacto {
  const out: FallasContacto = {};
  if (esNombrePlaceholder(c.nombre)) out.nombre = "No tiene nombre real";
  if (!c.telefono || !isValidTelefono(c.telefono)) out.telefono = "No tiene un celular válido";
  else if (ultimos.smsFallido) out.telefono = "El último SMS no le llegó";
  if (!c.email) out.email = "No tiene correo";
  else if (!esEmailEnviable(c.email)) out.email = "El correo está mal escrito";
  else if (ultimos.correoSuprimido) out.email = "El correo rebotó";
  else if (ultimos.correoFallido) out.email = "El último correo no salió";
  return out;
}
