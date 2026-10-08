"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cupones } from "@/db/schema";
import * as dataAccess from "@/lib/dataAccess";
import {
  beneficioCupon,
  esEmailEnviable,
  fmtFecha,
  formatTelefono,
  isValidTelefono,
  MODULOS_BORRAN_CUPONES,
  MODULOS_CREAN_CUPONES,
} from "@/lib/helpers";
import { envolverCorreoBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { sesionActual, tieneAlgunModulo, tieneSesionValida } from "@/lib/session";
import { enviarMensajeTexto } from "@/lib/whatsapp/enviar";
import type { Cupon } from "@/types";

// No hay un módulo "cupones" en la UI: el permiso sale de las pantallas que
// los emiten y canjean (ver MODULOS_CREAN_CUPONES). Antes bastaba una sesión
// válida, lo que desde que existe el módulo "pos" dejaba a un cajero de
// tienda emitirse un vale de lavado gratis.
export async function upsertCupones(rows: Cupon[]): Promise<boolean> {
  if (!(await tieneAlgunModulo(MODULOS_CREAN_CUPONES))) return false;
  return dataAccess.upsertCupones(rows);
}

/** Regla de patentes vigente en la base de un ticket ([] = cualquier patente;
 * null = sin permiso o el código no existe). El dueño de un Pack de Tickets la
 * puede cambiar desde Mi Cuenta (/regla-patentes) mientras el mesón sigue con
 * la copia que cargó al abrir: el canje la consulta justo antes de validar
 * (ver conReglaVigente en @/components/operador/reglaVigente). */
export async function reglaPatentesVigente(codigo: string): Promise<string[] | null> {
  if (!(await tieneAlgunModulo(MODULOS_CREAN_CUPONES))) return null;
  const [fila] = await getDb()
    .select({ patentes: cupones.patentesAutorizadas })
    .from(cupones)
    .where(eq(cupones.codigo, codigo))
    .limit(1);
  return fila ? fila.patentes || [] : null;
}

export async function deleteCupones(ids: string[]): Promise<boolean> {
  if (!(await tieneAlgunModulo(MODULOS_BORRAN_CUPONES))) return false;
  return dataAccess.deleteCupones(ids);
}

/** Condiciones de uso en una línea, para que el cliente sepa si puede
 * regalarlo. Un "vale" sin `patentesAutorizadas` lo canjea cualquier auto
 * (ver patenteAutorizadaParaCupon). Va pegado al beneficio en el template
 * (su texto está aprobado y fijo en Meta, ver crear-template-entrega-cupon),
 * por eso sin saltos de línea: Meta rechaza variables con 
. */
function condicionesCupon(c: Cupon): string {
  if (c.tipo !== "vale") return "un solo uso";
  if (!c.patentesAutorizadas?.length) return "válido para cualquier vehículo, lo puedes compartir con quien quieras, un solo uso";
  return `válido solo para la patente ${c.patentesAutorizadas.join(", ")}, un solo uso`;
}

/** Entrega al cliente el código de un cupón recién generado desde su ficha,
 * por los dos canales que tenemos: WhatsApp y correo. Cada uno devuelve su
 * propio resultado en texto porque casi siempre uno de los dos no aplica (la
 * mitad de las fichas no tiene correo) y el operador tiene que ver cuál llegó
 * y cuál no antes de dejar ir al cliente.
 *
 * El contenido se arma con lo que hay en la base, no con lo que manda el
 * navegador: la Server Action es un POST alcanzable directo (ver el
 * comentario del barrel), y `codigo` + `clienteId` son lo único que se
 * acepta de afuera. */
export async function enviarCuponAlCliente(clienteId: string, codigo: string): Promise<{ correo: string; whatsapp: string }> {
  if (!(await tieneSesionValida())) return { correo: "Sin sesión", whatsapp: "Sin sesión" };
  const sesion = await sesionActual();

  const [cliente] = await dataAccess.getClientesByIds([clienteId]);
  const cupon = await dataAccess.obtenerCuponPorCodigo(codigo.trim().toUpperCase());
  if (!cliente || !cupon) return { correo: "Cupón no encontrado", whatsapp: "Cupón no encontrado" };

  const beneficio = `${beneficioCupon(cupon)} (${condicionesCupon(cupon)})`;
  const vence = fmtFecha(cupon.fechaCaducidad);
  const nombre = cliente.nombre || "";

  return {
    correo: await enviarPorCorreo(cliente.email, cliente.id, nombre, cupon.codigo, beneficio, vence),
    whatsapp: await enviarPorWhatsapp(cliente.telefono, nombre, cupon.codigo, beneficio, vence, sesion?.nombre),
  };
}

async function enviarPorCorreo(
  email: string | undefined,
  clienteId: string,
  nombre: string,
  codigo: string,
  beneficio: string,
  vence: string
): Promise<string> {
  if (!esEmailEnviable(email)) return email ? "Correo inválido en la ficha" : "Sin correo en la ficha";
  const envio = await enviarCorreoTransaccional({
    to: email!.trim(),
    subject: `Tu código ZPlash: ${codigo}`,
    html: envolverCorreoBase(
      "Hola {{nombre}}, te dejamos tu **{{beneficio}}** en ZPlash.\n\n" +
        "Código: **{{codigo}}**\n\n" +
        "Válido hasta el {{vence}} — muéstralo al llegar, o revísalo cuando quieras en “Mis tickets y cupones” dentro de Mi Cuenta.",
      { nombre, beneficio, codigo, vence }
    ),
    clienteId,
  });
  return envio.ok ? `Correo enviado a ${email}` : `Correo no enviado (${envio.error || "error"})`;
}

async function enviarPorWhatsapp(
  telefono: string | undefined,
  nombre: string,
  codigo: string,
  beneficio: string,
  vence: string,
  enviadoPor: string | undefined
): Promise<string> {
  if (!telefono?.trim() || !isValidTelefono(telefono)) return telefono?.trim() ? "Teléfono inválido en la ficha" : "Sin teléfono en la ficha";
  const numero = formatTelefono(telefono);

  try {
    // Solo dentro de la ventana de 24h (el cliente nos escribió), donde el
    // texto libre no se cobra. Fuera de ella no se manda el template: desde
    // oct-2026 no iniciamos conversaciones por WhatsApp, el cupón va por correo.
    const conversacion = await dataAccess.buscarOCrearConversacion(numero);
    if (!(await dataAccess.dentroVentana24h(conversacion.id))) return "WhatsApp no enviado (el cliente no ha escrito en 24 h; va solo por correo)";
    const mensaje = await enviarMensajeTexto(
      numero,
      `Hola ${nombre}! Te dejamos tu ${beneficio.toLowerCase()} en ZPlash 🚗\n\nCódigo: ${codigo}\nVálido hasta el ${vence}.`,
      enviadoPor
    );
    return mensaje.estado === "enviado" ? `WhatsApp enviado a ${numero}` : `WhatsApp no enviado (${mensaje.error || "error"})`;
  } catch (error) {
    console.error("Error enviando el cupón por WhatsApp", codigo, error);
    return "WhatsApp no enviado (error)";
  }
}
