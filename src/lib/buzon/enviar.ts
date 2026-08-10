import "server-only";

import nodemailer from "nodemailer";
import { conConexionImap, transporteSmtp, usuarioBuzon } from "./cliente";
import { listarCarpetas } from "./leer";
import type { EnvioCorreo, ResultadoEnvioCorreo } from "@/types";

// Adjunto ya leído en memoria (viene de un File subido en /api/correo/enviar,
// ver route.ts) — a diferencia de AdjuntoDescargado (@/types/buzon, base64
// para cruzar a un componente cliente), esto vive enteramente server-side,
// así que un Buffer real es más simple que codificar/decodificar base64 dos
// veces de más.
export interface AdjuntoParaEnviar {
  nombre: string;
  tipo?: string;
  contenido: Buffer;
}

// Compila el mismo mailOptions a un buffer RFC822 crudo (sin enviarlo) para
// poder guardarlo en la carpeta Enviados por IMAP — a diferencia de
// WhatsApp/Meta Cloud API, el servidor SMTP de Banahost no guarda copia
// automática de lo que se envía, así que hay que hacer el APPEND a mano.
async function compilarMensajeCrudo(mailOptions: nodemailer.SendMailOptions): Promise<Buffer> {
  const streamTransport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = await streamTransport.sendMail(mailOptions);
  return info.message as Buffer;
}

// nodemailer/mailcomposer omite el header Bcc del mensaje compilado a
// propósito (nunca debe llegar a ningún destinatario) — como consecuencia,
// la copia que queda en Enviados tampoco muestra a quién se mandó en copia
// oculta. Es una limitación conocida, no un bug: reconstruir el header a
// mano solo para el archivo interno no vale la complejidad que agrega.
async function guardarEnEnviados(raw: Buffer): Promise<void> {
  const carpetas = await listarCarpetas();
  const enviados = carpetas.find((c) => c.especial === "sent");
  if (!enviados) return; // sin carpeta "Enviados" detectada, se omite (no es crítico: el correo ya salió)
  await conConexionImap(async (client) => {
    await client.append(enviados.path, raw, ["\\Seen"]);
  });
}

// Envía un correo nuevo o una respuesta (si viene inReplyTo/references) vía
// SMTP y, si tuvo éxito, guarda una copia en la carpeta Enviados. El fallo al
// guardar la copia no se reporta como error del envío: el correo ya salió,
// solo no quedará visible en la pestaña Enviados de este panel.
export async function enviarCorreo(envio: EnvioCorreo, adjuntos?: AdjuntoParaEnviar[]): Promise<ResultadoEnvioCorreo> {
  const de = usuarioBuzon();
  const mailOptions = {
    from: de,
    to: envio.para.join(", "),
    cc: envio.cc?.length ? envio.cc.join(", ") : undefined,
    bcc: envio.bcc?.length ? envio.bcc.join(", ") : undefined,
    subject: envio.asunto,
    html: envio.html,
    inReplyTo: envio.inReplyTo,
    references: envio.references?.join(" "),
    attachments: adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.tipo })),
  };

  try {
    await transporteSmtp().sendMail(mailOptions);
  } catch (error) {
    console.error("Error enviando correo por SMTP", error);
    return { ok: false, error: "No se pudo enviar el correo. Intenta de nuevo." };
  }

  try {
    const raw = await compilarMensajeCrudo(mailOptions);
    await guardarEnEnviados(raw);
  } catch (error) {
    console.error("Correo enviado pero no se pudo guardar copia en Enviados", error);
  }

  return { ok: true };
}
