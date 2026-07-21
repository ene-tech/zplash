"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { ConfigGlobal } from "@/types";

// Gateada con "config", igual que el resto de la pestaña Administrador de
// Ingresos → Config: solo quien puede editar precios/horarios ahí puede
// cambiar el horario del bloqueo del módulo Operador.
export async function upsertConfig(cfg: ConfigGlobal): Promise<boolean> {
  if (!(await tieneModulo("config"))) return false;
  return dataAccess.upsertConfig(cfg);
}
