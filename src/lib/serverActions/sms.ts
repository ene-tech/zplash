"use server";

import { sesionActual, tieneModulo } from "@/lib/session";
import * as dataAccess from "@/lib/dataAccess";
import { saldoLabsMobile } from "@/lib/sms/enviar";
import { enviarMensajesMasivosSms as enviarMensajesMasivosSmsImpl } from "@/lib/sms/masivo";
import type { OpcionesOfertaMasivo } from "@/lib/whatsapp/masivo";
import type { ResultadoEnvioMasivoSms, ResumenSmsCampana, SaldoSms, SmsEnviado } from "@/types";

export async function enviarMensajesMasivosSms(
  opts: OpcionesOfertaMasivo & { campana: string; texto: string; clienteIds: string[] }
): Promise<ResultadoEnvioMasivoSms> {
  const vacio: ResultadoEnvioMasivoSms = { total: 0, enviados: 0, fallidos: 0, sinTelefono: 0, omitidos: 0, repetidos: 0, segmentos: 0 };
  if (!(await tieneModulo("web_settings"))) return vacio;
  const sesion = await sesionActual();
  if (!sesion) return vacio;
  return enviarMensajesMasivosSmsImpl({ ...opts, enviadoPor: sesion.nombre });
}

export async function resumenSmsPorCampana(desdeISO: string, hastaISO: string): Promise<ResumenSmsCampana[]> {
  if (!(await tieneModulo("web_settings"))) return [];
  return dataAccess.resumenSmsPorCampana(desdeISO, hastaISO);
}

export async function listarUltimosSms(): Promise<SmsEnviado[]> {
  if (!(await tieneModulo("web_settings"))) return [];
  return dataAccess.listarUltimosSms(50);
}

export async function saldoSms(): Promise<SaldoSms> {
  if (!(await tieneModulo("web_settings"))) return { error: "Sin permiso" };
  return saldoLabsMobile();
}
