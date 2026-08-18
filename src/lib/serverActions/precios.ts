"use server";

import { revalidateTag } from "next/cache";
import * as dataAccess from "@/lib/dataAccess";
import { INVALIDAR_YA, TAG_CONTENIDO_PUBLICO } from "@/lib/preciosPublicos";
import { tieneModulo } from "@/lib/session";
import type { Precios, PreciosTamano } from "@/types";

// Gateada con "config" o "web_settings": la pestaña Configuración y la
// pestaña Web Settings son las dos únicas superficies que escriben acá (esta
// última reservada a Gerencia por defecto, ver TODOS_LOS_MODULOS en helpers).
export async function upsertPrecios(precios: Precios): Promise<boolean> {
  if (!(await tieneModulo("config")) && !(await tieneModulo("web_settings"))) return false;
  const ok = await dataAccess.upsertPrecios(precios);
  // Sin esto el sitio público seguiría mostrando el precio viejo (ver
  // getPreciosPublicos): lo que cobra Webpay cambia en el acto, la vitrina no.
  if (ok) revalidateTag(TAG_CONTENIDO_PUBLICO, INVALIDAR_YA);
  return ok;
}

export async function upsertPreciosTamano(precios: PreciosTamano): Promise<boolean> {
  if (!(await tieneModulo("config")) && !(await tieneModulo("web_settings"))) return false;
  const ok = await dataAccess.upsertPreciosTamano(precios);
  if (ok) revalidateTag(TAG_CONTENIDO_PUBLICO, INVALIDAR_YA);
  return ok;
}
