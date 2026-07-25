"use server";

import * as dataAccess from "@/lib/dataAccess";
import { sesionActual, tieneModulo } from "@/lib/session";
import { enviarMensajeTexto } from "@/lib/whatsapp/enviar";
import type { ConversacionWhatsapp, MensajeWhatsapp } from "@/types";

export async function listarConversaciones(): Promise<ConversacionWhatsapp[]> {
  if (!(await tieneModulo("mensajes"))) return [];
  return dataAccess.listarConversaciones();
}

export async function listarMensajes(conversacionId: string): Promise<MensajeWhatsapp[]> {
  if (!(await tieneModulo("mensajes"))) return [];
  return dataAccess.listarMensajes(conversacionId);
}

export async function marcarLeida(conversacionId: string): Promise<boolean> {
  if (!(await tieneModulo("mensajes"))) return false;
  await dataAccess.marcarConversacionLeida(conversacionId);
  return true;
}

export async function enviarMensajeManual(telefono: string, texto: string): Promise<boolean> {
  if (!(await tieneModulo("mensajes"))) return false;
  const sesion = await sesionActual();
  if (!sesion) return false;
  if (!texto.trim()) return false;

  try {
    await enviarMensajeTexto(telefono, texto.trim(), sesion.nombre);
    return true;
  } catch (error) {
    console.error("Error enviando mensaje manual de WhatsApp", error);
    return false;
  }
}
