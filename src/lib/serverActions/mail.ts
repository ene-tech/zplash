"use server";

import * as dataAccess from "@/lib/dataAccess";
import { enviarCorreosMasivos as enviarCorreosMasivosImpl } from "@/lib/mailing/masivo";
import { enviarInvitacionesMigracionWoo as enviarInvitacionesMigracionWooImpl } from "@/lib/mailing/migracionWoo";
import { sesionActual, tieneModulo } from "@/lib/session";
import type { SuscripcionOneclickInfo } from "@/lib/dataAccess";
import type { HistorialReglaCorreo, PlantillaCorreo, ReglaCorreo, ResultadoEnvioMasivoCorreo } from "@/types";

export async function upsertPlantillasCorreo(rows: PlantillaCorreo[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertPlantillasCorreo(rows);
}

export async function deletePlantillasCorreo(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.deletePlantillasCorreo(ids);
}

export async function upsertReglasCorreo(rows: ReglaCorreo[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.upsertReglasCorreo(rows);
}

export async function deleteReglasCorreo(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("web_settings"))) return false;
  return dataAccess.deleteReglasCorreo(ids);
}

export async function listarHistorialReglasCorreo(): Promise<HistorialReglaCorreo[]> {
  if (!(await tieneModulo("web_settings"))) return [];
  return dataAccess.listarHistorialReglasCorreo();
}

// Pre-exclusión visual en Web Settings → Correos Únicos: a quién ya le llegó
// esta plantilla desde `desdeISO` (ver clienteIdsConCorreoDePlantilla).
export async function clienteIdsConCorreoDePlantilla(plantillaCorreoId: string, desdeISO: string): Promise<string[]> {
  if (!(await tieneModulo("web_settings"))) return [];
  return dataAccess.clienteIdsConCorreoDePlantilla(plantillaCorreoId, desdeISO);
}

// Suscripciones Oneclick para el filtro de "cobro automático" de Correos
// Únicos. Va por acá y no por listarSuscripcionesOneclick (@/lib/serverActions/
// oneclick) porque esa exige el módulo "clientes", y esta pantalla vive en
// Web Settings — un perfil con web_settings pero sin clientes se quedaría sin
// poder filtrar.
export async function suscripcionesParaFiltroCorreo(): Promise<SuscripcionOneclickInfo[]> {
  if (!(await tieneModulo("web_settings"))) return [];
  return dataAccess.listarSuscripcionesOneclick();
}

// Envío puntual de una plantilla a un grupo filtrado a mano (Web Settings →
// Correos Únicos) — ver comentario en @/lib/mailing/masivo.
export async function enviarCorreosMasivos(opts: {
  plantillaCorreoId: string;
  clienteIds: string[];
}): Promise<ResultadoEnvioMasivoCorreo> {
  const vacio: ResultadoEnvioMasivoCorreo = { total: 0, enviados: 0, fallidos: 0, sinEmail: 0, omitidos: 0 };
  if (!(await tieneModulo("web_settings"))) return vacio;
  const sesion = await sesionActual();
  if (!sesion) return vacio;
  return enviarCorreosMasivosImpl({ ...opts, enviadoPor: sesion.nombre });
}

// Campaña de migración WooCommerce→Oneclick (Web Settings → Reglas Correo) —
// ver comentario en @/lib/mailing/migracionWoo.
export async function enviarInvitacionesMigracionWoo(): Promise<ResultadoEnvioMasivoCorreo> {
  const vacio: ResultadoEnvioMasivoCorreo = { total: 0, enviados: 0, fallidos: 0, sinEmail: 0 };
  if (!(await tieneModulo("web_settings"))) return vacio;
  return enviarInvitacionesMigracionWooImpl();
}
