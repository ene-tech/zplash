"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo, tieneSesionValida } from "@/lib/session";

export async function subirComprobanteGasto(id: string, file: File): Promise<string | null> {
  if (!(await tieneSesionValida())) return null;
  return dataAccess.subirComprobanteGasto(id, file);
}

export async function subirBannerServicio(servicioId: string, file: File): Promise<string | null> {
  if (!(await tieneModulo("web_settings"))) return null;
  return dataAccess.subirBannerServicio(servicioId, file);
}
