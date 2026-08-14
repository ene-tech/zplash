import "server-only";

import { Resend } from "resend";

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
}

export interface ResultadoEnvioTransaccional {
  ok: boolean;
  error?: string;
}

/**
 * Envía un correo transaccional vía Resend. Si RESEND_API_KEY o
 * MAIL_FROM_ADDRESS no están configuradas, retorna `{ok:false, error:"no
 * configurado"}` en vez de lanzar — así el motor de reglas (@/lib/mailing/
 * reglas) puede desplegarse y probarse (quedan disparos en estado "error"
 * con ese motivo) antes de que termine el trámite de dominio/API key con
 * Resend (ver plan).
 */
export async function enviarCorreoTransaccional(envio: EnvioCorreoTransaccional): Promise<ResultadoEnvioTransaccional> {
  const resend = resendClient();
  const from = process.env.MAIL_FROM_ADDRESS;
  if (!resend || !from) {
    console.error("Envío de correo transaccional omitido: falta RESEND_API_KEY o MAIL_FROM_ADDRESS", envio.subject, envio.to);
    return { ok: false, error: "no configurado" };
  }

  const { error } = await resend.emails.send({ from, to: envio.to, subject: envio.subject, html: envio.html });
  if (error) {
    console.error("Error enviando correo transaccional vía Resend", envio.subject, envio.to, error);
    return { ok: false, error: error.message || "error del proveedor" };
  }
  return { ok: true };
}
