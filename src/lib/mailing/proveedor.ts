import "server-only";

import { Resend } from "resend";

import { buscarSupresionCorreo } from "@/lib/dataAccess/correosSuprimidos";
import { registrarCorreoAutomatico } from "@/lib/dataAccess/mail";
import { uid } from "@/lib/helpers";
import { linksConOrigen } from "@/lib/helpers/utm";
import { motivoEmailInvalido, normalizarEmail } from "./direcciones";
import { enviarPorSes, type CredencialesAws, type ErrorSes } from "./ses";

// Capa de envío de correo TRANSACCIONAL (confirmaciones de compra, avisos de
// cobro fallido, vencimiento, campaña de migración WooCommerce) — a
// propósito NO reutiliza enviarCorreo()/@/lib/buzon (ese es el buzón humano
// de soporte por SMTP de Banahost, guarda copia en "Enviados" para que un
// operador lo revise). Mezclar acá arriesga la entregabilidad de ese buzón
// real (no pensado para volumen) y no tiene sentido guardar copia de un
// correo automático en la bandeja de soporte. Resend: buen soporte
// Next.js/Vercel, dominio propio, nivel gratis suficiente para el volumen de
// ZPlash — ver plan "Motor de correos automáticos". Desde oct-2026 también
// Amazon SES detrás de CORREO_PROVEEDOR=ses (ver ./ses y docs/migracion-ses.md).
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
  adjuntos?: { nombre: string; contenido: Buffer }[];
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

// Amazon SES rechaza con BadRequestException tanto una dirección mala como un
// remitente mal configurado, y en sandbox con MessageRejected "Email address
// is not verified" a cualquier destinatario no verificado. Solo el primer caso
// es permanente: se reusa esRechazoDeDireccion (mismas reglas asimétricas que
// con Resend) y además se exige un BadRequest y que no hable de verificación.
// Exportada para el test.
export function esRechazoSesDeDireccion(error: ErrorSes, destinatario: string): boolean {
  if (error.name !== "BadRequestException") return false;
  if (/verif/i.test(error.message)) return false;
  return esRechazoDeDireccion(error, destinatario);
}

type Proveedor = { tipo: "resend"; resend: Resend } | { tipo: "ses"; credenciales: CredencialesAws; configurationSet?: string };

// CORREO_PROVEEDOR=ses cambia TODO el correo automático a Amazon SES; sin la
// variable (o con cualquier otro valor) sale por Resend como siempre. Con
// "ses" y credenciales incompletas NO se cae a Resend a escondidas: queda "no
// configurado", visible en los disparos, para que el error se note.
function proveedorConfigurado(): Proveedor | null {
  if ((process.env.CORREO_PROVEEDOR || "").trim().toLowerCase() === "ses") {
    const region = process.env.AWS_SES_REGION;
    const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
    if (!region || !accessKeyId || !secretAccessKey) return null;
    return { tipo: "ses", credenciales: { region, accessKeyId, secretAccessKey }, configurationSet: process.env.AWS_SES_CONFIGURATION_SET || undefined };
  }
  const resend = resendClient();
  return resend ? { tipo: "resend", resend } : null;
}

async function enviarPorProveedor(
  proveedor: Proveedor,
  envio: { from: string; to: string; subject: string; html: string; adjuntos?: EnvioCorreoTransaccional["adjuntos"] }
): Promise<ResultadoEnvioTransaccional & { proveedorId?: string }> {
  if (proveedor.tipo === "ses") {
    const r = await enviarPorSes(proveedor.credenciales, { ...envio, configurationSet: proveedor.configurationSet });
    if (r.ok) return { ok: true, proveedorId: r.messageId };
    console.error("Error enviando correo transaccional vía SES", envio.subject, envio.to, r.error);
    return { ok: false, error: r.error.message || r.error.name || "error del proveedor", permanente: esRechazoSesDeDireccion(r.error, envio.to) };
  }
  const { data, error } = await proveedor.resend.emails.send({
    from: envio.from,
    to: envio.to,
    subject: envio.subject,
    html: envio.html,
    attachments: envio.adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido })),
  });
  if (!error) return { ok: true, proveedorId: data?.id };
  console.error("Error enviando correo transaccional vía Resend", envio.subject, envio.to, error);
  return {
    ok: false,
    // El objeto de error de Resend a veces llega sin `message` legible (se
    // loguea como "{}", ver casos de direcciones malformadas en el log de
    // dev): ahí sirve al menos el `name` del error ("validation_error",
    // etc.), que es lo que va a quedar visible en la bandeja de salida.
    error: error.message || error.name || "error del proveedor",
    permanente: esRechazoDeDireccion(error, envio.to),
  };
}

/**
 * Envía un correo transaccional por Resend o, con CORREO_PROVEEDOR=ses, por
 * Amazon SES (ver docs/migracion-ses.md). Si el proveedor elegido o
 * MAIL_FROM_ADDRESS no están configurados, retorna `{ok:false, error:"no
 * configurado"}` en vez de lanzar — así el motor de reglas (@/lib/mailing/
 * reglas) puede desplegarse y probarse antes de tener credenciales.
 *
 * Antes de llamar al proveedor, con cualquiera de los dos:
 *  - la dirección se normaliza (espacios, mayúsculas) y se valida (ver
 *    ./direcciones); si no sirve no se manda y es `permanente`;
 *  - si está en correos_suprimidos (rebote permanente, queja o manual) no se
 *    manda. Solo el rebote es `permanente` (la dirección no existe, el
 *    operador tiene que pedir otra); una queja o una baja manual no borran el
 *    email de la ficha.
 *
 * Pase lo que pase deja una copia en `correos_automaticos` (la bandeja de
 * salida que se ve en Correo → Salida automática, ver comentario en
 * @/db/schema/mail) — también cuando el envío falla o se descarta, con el
 * motivo en `error`. La única excepción es "no configurado": ahí no hay
 * remitente que registrar y no se intentó ningún envío.
 */
export async function enviarCorreoTransaccional(envio: EnvioCorreoTransaccional): Promise<ResultadoEnvioTransaccional> {
  const proveedor = proveedorConfigurado();
  const from = process.env.MAIL_FROM_ADDRESS;
  if (!proveedor || !from) {
    console.error("Envío de correo transaccional omitido: falta configurar el proveedor (RESEND_API_KEY o AWS_SES_*) o MAIL_FROM_ADDRESS", envio.subject, envio.to);
    return { ok: false, error: "no configurado" };
  }

  const registrar = (r: { para: string; estado: "enviado" | "error"; error?: string; proveedorId?: string }) =>
    registrarCorreoAutomatico({
      id: uid(),
      de: from,
      para: r.para,
      asunto: envio.subject,
      html: envio.html,
      estado: r.estado,
      error: r.error,
      proveedorId: r.proveedorId,
      disparoId: envio.disparoId,
      clienteId: envio.clienteId,
    });

  // Direcciones que no pueden recibir nada se descartan ANTES de llamar al
  // proveedor: ahorra la llamada y, sobre todo, no ensucia la tasa de rebote
  // — que con Resend es cosmético pero con SES es motivo de suspensión. La
  // copia en la bandeja de salida guarda la dirección tal como venía.
  const to = normalizarEmail(envio.to);
  const motivoInvalido = motivoEmailInvalido(to);
  if (motivoInvalido) {
    const error = `dirección no enviable: ${motivoInvalido}`;
    console.error("Correo transaccional descartado:", error, envio.to, envio.subject);
    await registrar({ para: envio.to, estado: "error", error });
    return { ok: false, error, permanente: true };
  }

  const supresion = await buscarSupresionCorreo(to);
  if (supresion) {
    const error = `dirección suprimida (${supresion.motivo}${supresion.detalle ? `: ${supresion.detalle}` : ""})`.slice(0, 300);
    console.error("Correo transaccional descartado:", error, to, envio.subject);
    await registrar({ para: to, estado: "error", error });
    return { ok: false, error, permanente: supresion.motivo === "rebote" };
  }

  // Links a zplash.cl marcados como venidos del correo, para PostHog (ver
  // @/lib/helpers/utm); la copia en la bandeja de salida queda sin marcar.
  const html = linksConOrigen(envio.html, { source: "correo", medium: "email" });
  const { proveedorId, ...resultado } = await enviarPorProveedor(proveedor, { from, to, subject: envio.subject, html, adjuntos: envio.adjuntos });

  await registrar({ para: to, estado: resultado.ok ? "enviado" : "error", error: resultado.error, proveedorId });

  return resultado;
}
