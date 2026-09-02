"use server";

import * as dataAccess from "@/lib/dataAccess";
import { beneficioCupon, esEmailEnviable, fmtFecha, formatTelefono, isValidTelefono } from "@/lib/helpers";
import { envolverCorreoBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { sesionActual, tieneSesionValida } from "@/lib/session";
import { enviarMensajePlantilla, enviarMensajeTexto } from "@/lib/whatsapp/enviar";
import type { Cupon } from "@/types";

// No hay un módulo "cupones" en la UI; cualquier sesión válida puede
// gestionarlos. Intencional, no un descuido.
export async function upsertCupones(rows: Cupon[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertCupones(rows);
}

export async function deleteCupones(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteCupones(ids);
}

// Template de Meta para entregar un código fuera de la ventana de 24h (dentro
// de ella se manda texto libre, que sale igual y no cuesta conversación). Las
// variables van posicionales: {{1}} nombre, {{2}} beneficio, {{3}} código,
// {{4}} fecha de caducidad — ver scripts/crear-template-entrega-cupon.mts,
// que es con lo que se crea y se manda a aprobar en el WABA, y que además
// documenta por qué el template es MARKETING y por qué el cuerpo no puede
// decir "Código: X" (Meta lo confunde con un OTP y lo rechaza).
const TEMPLATE_ENTREGA_CUPON = "entrega_codigo_cupon";
const IDIOMA_TEMPLATE = "es_CL";

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

  const beneficio = beneficioCupon(cupon);
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
    // Dentro de la ventana de 24h el texto libre pasa y se lee mejor; fuera,
    // Meta solo acepta un template aprobado (ver enviarMensajeTexto).
    const conversacion = await dataAccess.buscarOCrearConversacion(numero);
    const mensaje = (await dataAccess.dentroVentana24h(conversacion.id))
      ? await enviarMensajeTexto(
          numero,
          `Hola ${nombre}! Te dejamos tu ${beneficio.toLowerCase()} en ZPlash 🚗\n\nCódigo: ${codigo}\nVálido hasta el ${vence}.`,
          enviadoPor
        )
      : await enviarMensajePlantilla(numero, TEMPLATE_ENTREGA_CUPON, IDIOMA_TEMPLATE, [nombre, beneficio, codigo, vence], enviadoPor);
    return mensaje.estado === "enviado" ? `WhatsApp enviado a ${numero}` : `WhatsApp no enviado (${mensaje.error || "error"})`;
  } catch (error) {
    console.error("Error enviando el cupón por WhatsApp", codigo, error);
    return "WhatsApp no enviado (error)";
  }
}
