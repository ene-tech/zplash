"use server";

import { revalidateTag } from "next/cache";
import * as dataAccess from "@/lib/dataAccess";
import { INVALIDAR_YA, TAG_CONTENIDO_PUBLICO } from "@/lib/preciosPublicos";
import { tieneModulo } from "@/lib/session";
import type { ConfigGlobal } from "@/types";

// Gateada con "config", igual que el resto de la pestaña Administrador de
// Ingresos → Config: solo quien puede editar precios/horarios ahí puede
// cambiar el horario del bloqueo del módulo Operador.
export async function upsertConfig(cfg: ConfigGlobal): Promise<boolean> {
  if (!(await tieneModulo("config"))) return false;
  const ok = await dataAccess.upsertConfig(cfg);
  // La fila `config` también alimenta la landing (vigencia del pack de
  // tickets y el descuento de bienvenida, ver getPreciosPublicos).
  if (ok) revalidateTag(TAG_CONTENIDO_PUBLICO, INVALIDAR_YA);
  return ok;
}
