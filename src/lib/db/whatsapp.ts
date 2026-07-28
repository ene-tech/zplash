"use server";

import * as dataAccess from "@/lib/dataAccess";
import { sesionActual, tieneModulo } from "@/lib/session";
import { enviarMensajesMasivosWhatsapp as enviarMensajesMasivosWhatsappImpl } from "@/lib/whatsapp/masivo";
import type { HistorialReglaWhatsapp, PlantillaWhatsapp, ReglaWhatsapp, ResultadoEnvioMasivoWhatsapp } from "@/types";

export async function upsertPlantillasWhatsapp(rows: PlantillaWhatsapp[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertPlantillasWhatsapp(rows);
}

export async function deletePlantillasWhatsapp(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.deletePlantillasWhatsapp(ids);
}

export async function upsertReglasWhatsapp(rows: ReglaWhatsapp[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertReglasWhatsapp(rows);
}

export async function deleteReglasWhatsapp(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.deleteReglasWhatsapp(ids);
}

export async function listarHistorialReglasWhatsapp(): Promise<HistorialReglaWhatsapp[]> {
  if (!(await tieneModulo("web_settings"))) return [];
  return dataAccess.listarHistorialReglasWhatsapp();
}

export async function contarMensajesWhatsappGenerados(desdeISO: string, hastaISO: string): Promise<number> {
  if (!(await tieneModulo("web_settings"))) return 0;
  return dataAccess.contarMensajesWhatsappGenerados(desdeISO, hastaISO);
}

export async function enviarMensajesMasivosWhatsapp(opts: {
  plantillaId: string;
  clienteIds: string[];
  montoOferta?: number;
  diasValidez?: number;
}): Promise<ResultadoEnvioMasivoWhatsapp> {
  const vacio: ResultadoEnvioMasivoWhatsapp = { total: 0, enviados: 0, fallidos: 0, sinTelefono: 0 };
  if (!(await tieneModulo("web_settings"))) return vacio;
  const sesion = await sesionActual();
  if (!sesion) return vacio;
  return enviarMensajesMasivosWhatsappImpl({ ...opts, enviadoPor: sesion.nombre });
}
