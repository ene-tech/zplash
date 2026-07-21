"use server";

import * as dataAccess from "@/lib/dataAccess";
import { ahoraEnSantiago, dentroDeHorarioOperador, esExentoHorarioOperador } from "@/lib/helpers";
import { sesionActual } from "@/lib/session";
import type { ConfigGlobal, Ingreso } from "@/types";

// El bloqueo horario del módulo Operador (ver ConfigGlobal/ConfigTab) se
// revisa acá, no solo en la UI: la UI ya oculta los botones de registro fuera
// de horario, pero como todo Server Action queda invocable por POST directo
// (ver comentario al inicio de src/lib/db/index.ts), este es el único lugar
// que de verdad puede impedirlo. Se exime a quien tenga acceso a Configuración
// o sea el perfil "Administración" (ver esExentoHorarioOperador) y se relee
// `config` desde la base en vez de confiar en el horario que traiga el cliente.
export async function insertIngresos(rows: Ingreso[]): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion) return false;
  if (!esExentoHorarioOperador(sesion.modulos, sesion.nombre)) {
    let config: ConfigGlobal;
    try {
      config = await dataAccess.getConfig();
    } catch (error) {
      // Si getConfig() falla (p.ej. una migración pendiente en la base), no
      // dejar que reviente todo commit() sin aviso — el operador ve "no se
      // pudo guardar" en vez de perder el registro en silencio.
      console.error("Error leyendo config para el bloqueo horario del módulo Operador", error);
      return false;
    }
    // `new Date()` acá reflejaría la hora del servidor (en producción, UTC),
    // no la hora de Chile — hay que convertirla explícitamente (ver
    // ahoraEnSantiago) para comparar contra el horario configurado.
    if (!dentroDeHorarioOperador(config, ahoraEnSantiago())) return false;
  }
  return dataAccess.insertIngresos(rows);
}
