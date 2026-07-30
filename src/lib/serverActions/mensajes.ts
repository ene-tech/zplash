"use server";

import * as dataAccess from "@/lib/dataAccess";
import { diagnosticoPushGerencia, type DiagnosticoPushGerencia } from "@/lib/push/enviar";
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

export async function enviarMensajeManual(conversacionId: string, telefono: string, texto: string): Promise<boolean> {
  if (!(await tieneModulo("mensajes"))) return false;
  const sesion = await sesionActual();
  if (!sesion) return false;
  if (!texto.trim()) return false;

  // Fuera de la ventana de 24h desde el último mensaje entrante, WhatsApp
  // rechaza texto libre (solo admite plantillas pre-aprobadas) — la UI ya
  // deshabilita el botón (ver fueraDeVentana24h en MensajesView.tsx), esto es
  // el backstop server-side para no depender solo de ese chequeo del cliente.
  if (!(await dataAccess.dentroVentana24h(conversacionId))) return false;

  try {
    await enviarMensajeTexto(telefono, texto.trim(), sesion.nombre);
    return true;
  } catch (error) {
    console.error("Error enviando mensaje manual de WhatsApp", error);
    return false;
  }
}

// Botón "Probar notificación" en MensajesView (solo perfil Gerencia) — corre
// el mismo camino que dispara el bot al recibir OPCIONES_HUMANO, pero desde
// una Server Action invocada a mano, para diagnosticar en qué paso se corta
// el aviso (VAPID sin configurar en el deploy, Gerencia sin suscripción,
// webpush rechazado) sin depender de mirar los logs de Vercel.
export async function probarPushGerencia(): Promise<DiagnosticoPushGerencia> {
  if (!(await tieneModulo("mensajes"))) {
    return { vapidConfigurado: false, gerenciaExiste: false, suscripciones: 0, entregadoAlMenosUna: false };
  }
  return diagnosticoPushGerencia({
    title: "Prueba de notificaciones",
    body: "Si ves esto, las notificaciones de ZPlash funcionan en producción.",
    url: "/",
  });
}
