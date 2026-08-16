import "server-only";

import { Resend } from "resend";

import { registrarCorreoAutomatico } from "@/lib/dataAccess/mail";
import { esEmailEnviable, uid } from "@/lib/helpers";

// Capa de envío de correo TRANSACCIONAL (confirmaciones de compra, avisos de
// cobro fallido, vencimiento, campaña de migración WooCommerce) — a
// propósito NO reutiliza enviarCorreo()/@/lib/buzon (ese es el buzón humano
// de soporte por SMTP de Banahost, guarda copia en "Enviados" para que un
// operador lo revise). Mezclar acá arriesga la entregabilidad de ese buzón
// real (no pensado para volumen) y no tiene sentido guardar copia de un
// correo automático en la bandeja de soporte. Resend: buen soporte
// Next.js/Vercel, dominio propio, nivel gratis suficiente para el volumen de
// ZPlash — ver plan "Motor de correos automáticos".
let cliente: Resend | null | undefined;

function resendClient(): Resend | null {
  if (cliente !== undefined) return cliente;
  const apiKey = process.env.RESEND_API_KEY;
  cliente = apiKey ? new Resend(apiKey) : null;
  return cliente;
}

export interface EnvioCorreoTransaccional {
  to: string;
  subject: string;
  html: string;
  // Solo para la copia en la bandeja de salida (ver
  // registrarCorreoAutomatico): de qué disparo/cliente vino este correo, para
  // poder mostrar el nombre junto al destinatario y cruzarlo con Historial
  // Correo. No afectan el envío en sí.
  disparoId?: string;
  clienteId?: string;
}

export interface ResultadoEnvioTransaccional {
  ok: boolean;
  error?: string;
  // true solo cuando el proveedor rechazó la DIRECCIÓN del destinatario, o
  // sea un fallo que reintentar no arregla. El motor lo usa para borrarle el
  // email al cliente (ver ejecutarAccionReglaCorreo), así que se marca con
  // criterio conservador: cualquier otro fallo (límite de envío, caída del
  // proveedor, API key mala) deja el email intacto. Ante la duda, `false`.
  permanente?: boolean;
}

// Un `validation_error` de Resend puede venir tanto por el destinatario como
// por el `from` o el asunto — y confundirlos sería catastrófico acá: un
// MAIL_FROM_ADDRESS mal configurado haría que TODOS los envíos fallen y, si
// eso contara como permanente, le borraríamos el correo a la base entera en
// una sola campaña. Por eso no basta el nombre del error: el mensaje tiene
// que señalar al destinatario y NO al remitente.
//
// Las dos reglas son deliberadamente asimétricas, porque los costos lo son:
//
//  - Cualquier mención del `from` descarta el rechazo de plano. El mensaje
//    real de ese caso ("Invalid `from` field. The email address needs to
//    follow the `email@example.com` format") trae "invalid" y un "to" suelto
//    de la prosa, así que basta un \bto\b para confundirlo con un rechazo del
//    destinatario y vaciar la base entera.
//  - Para reconocer al destinatario no se acepta ese "to" suelto: tiene que
//    venir el campo `to` como tal, la palabra recipient/destinatario, o la
//    dirección misma que se intentó usar.
//
// Ante la duda, `false`: reintentar un envío que igual va a fallar es mucho
// más barato que borrarle el correo bueno a un cliente.
// Exportada solo para el test: es la decisión de la que cuelga el borrado de
// emails, así que los mensajes reales del proveedor se fijan en proveedor.test.
export function esRechazoDeDireccion(error: { name?: string; message?: string }, destinatario: string): boolean {
  const mensaje = (error.message || "").toLowerCase();
  if (!mensaje) return false; // Resend a veces manda el error vacío ("{}"): sin evidencia, no se borra nada
  if (/\bfrom\b|remitente|domain is not verified/.test(mensaje)) return false;
  const direccion = destinatario.trim().toLowerCase();
  const hablaDelDestinatario = /`to`|\bto field\b|recipient|destinat/.test(mensaje) || (!!direccion && mensaje.includes(direccion));
  const esDireccionInvalida = /invalid|not valid|malformed|does not exist|no existe/.test(mensaje);
  return hablaDelDestinatario && esDireccionInvalida;
}

/**
 * Envía un correo transaccional vía Resend. Si RESEND_API_KEY o
 * MAIL_FROM_ADDRESS no están configuradas, retorna `{ok:false, error:"no
 * configurado"}` en vez de lanzar — así el motor de reglas (@/lib/mailing/
 * reglas) puede desplegarse y probarse (quedan disparos en estado "error"
 * con ese motivo) antes de que termine el trámite de dominio/API key con
 * Resend (ver plan).
 *
 * Pase lo que pase deja una copia en `correos_automaticos` (la bandeja de
 * salida que se ve en Correo → Salida automática, ver comentario en
 * @/db/schema/mail) — también cuando el envío falla, que es justo el caso que
 * alguien va a querer abrir para ver qué se intentó mandar. La única
 * excepción es "no configurado": ahí no hay remitente que registrar y no se
 * intentó ningún envío, así que anotarlo solo ensuciaría la bandeja en los
 * ambientes sin API key.
 */
export async function enviarCorreoTransaccional(envio: EnvioCorreoTransaccional): Promise<ResultadoEnvioTransaccional> {
  const resend = resendClient();
  const from = process.env.MAIL_FROM_ADDRESS;
  if (!resend || !from) {
    console.error("Envío de correo transaccional omitido: falta RESEND_API_KEY o MAIL_FROM_ADDRESS", envio.subject, envio.to);
    return { ok: false, error: "no configurado" };
  }

  // Direcciones que no pueden recibir nada (ver esEmailEnviable) se descartan
  // ANTES de llamar al proveedor: ahorra la llamada y, sobre todo, no ensucia
  // la tasa de rebote de la cuenta — que con Resend es cosmético pero con SES
  // es motivo de suspensión. Igual deja su copia en la bandeja de salida, con
  // la dirección mala a la vista, como cualquier otro envío fallido.
  if (!esEmailEnviable(envio.to)) {
    console.error("Correo transaccional descartado: dirección no enviable", envio.to, envio.subject);
    await registrarCorreoAutomatico({
      id: uid(),
      de: from,
      para: envio.to,
      asunto: envio.subject,
      html: envio.html,
      estado: "error",
      error: "dirección no enviable",
      disparoId: envio.disparoId,
      clienteId: envio.clienteId,
    });
    return { ok: false, error: "dirección no enviable", permanente: true };
  }

  const { data, error } = await resend.emails.send({ from, to: envio.to, subject: envio.subject, html: envio.html });
  const resultado: ResultadoEnvioTransaccional = error
    ? {
        ok: false,
        // El objeto de error de Resend a veces llega sin `message` legible (se
        // loguea como "{}", ver casos de direcciones malformadas en el log de
        // dev): ahí sirve al menos el `name` del error ("validation_error",
        // etc.), que es lo que va a quedar visible en la bandeja de salida.
        error: error.message || error.name || "error del proveedor",
        permanente: esRechazoDeDireccion(error, envio.to),
      }
    : { ok: true };
  if (error) console.error("Error enviando correo transaccional vía Resend", envio.subject, envio.to, error);

  await registrarCorreoAutomatico({
    id: uid(),
    de: from,
    para: envio.to,
    asunto: envio.subject,
    html: envio.html,
    estado: resultado.ok ? "enviado" : "error",
    error: resultado.error,
    proveedorId: data?.id,
    disparoId: envio.disparoId,
    clienteId: envio.clienteId,
  });

  return resultado;
}
