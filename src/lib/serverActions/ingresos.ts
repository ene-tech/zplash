"use server";

import * as dataAccess from "@/lib/dataAccess";
import { ahoraEnSantiago, dentroDeHorarioOperador, esExentoHorarioOperador, puedeBorrarIngreso, puedeRegistrarIngresos } from "@/lib/helpers";
import { sesionActual } from "@/lib/session";
import type { ConfigGlobal, Ingreso } from "@/types";

// Operador en turno: si Gerencia o Administración dejaron solo a algunos
// operadores registrando ingresos, el resto queda fuera (ver puedeRegistrarIngresos). Si
// la tabla no se puede leer no se bloquea: frenar el túnel entero por eso es
// peor. No exportada: no es una Server Action.
async function operadoresEnTurno(): Promise<string[] | null> {
  try {
    return (await dataAccess.getOperadorIngresos()).perfilIds;
  } catch (error) {
    console.error("Error leyendo el operador habilitado para ingresos", error);
    return null;
  }
}

/** Pregunta previa de commit(): insertIngresos es lo último que se graba
 * (clientes y cupones van antes, ventas en paralelo), así que si rechazara
 * recién ahí al operador fuera de turno, la venta y el ticket quedarían
 * grabados sin el ingreso. Mismo criterio que hayAltaEnDiaCerrado. */
export async function puedoRegistrarIngresosAhora(): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion) return false;
  return puedeRegistrarIngresos(sesion.id, sesion.nombre, await operadoresEnTurno());
}

// El bloqueo horario del módulo Operador (ver ConfigGlobal/ConfigTab) se
// revisa acá, no solo en la UI: la UI ya oculta los botones de registro fuera
// de horario, pero como todo Server Action queda invocable por POST directo
// (ver comentario al inicio de src/lib/serverActions/index.ts), este es el único lugar
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
  if (!puedeRegistrarIngresos(sesion.id, sesion.nombre, await operadoresEnTurno())) return false;
  // Un día con la caja ya cerrada no recibe más pasadas por el túnel: su
  // resumen quedó firmado y no se puede volver a mover (ver CierreCaja).
  if (await dataAccess.altaEnDiaCerrado(rows.map((i) => i.fecha))) return false;
  return dataAccess.insertIngresos(rows);
}

// Gateada con puedeBorrarIngreso (perfil "Gerencia" o módulo "arqueo"), a diferencia de
// insertIngresos: el Historial de Ingresos nace de solo alta (ver el
// comentario en @/context/commit/ingresos.ts) y borrar una fila ya guardada
// es la excepción deliberada a eso, así que queda igual de restringida que
// borrar una Venta o una categoría de Inventario — este es el único lugar
// que de verdad puede impedirlo, ya que todo Server Action queda invocable
// por POST directo.
export async function deleteIngresos(ids: string[]): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion || !puedeBorrarIngreso(sesion.nombre, sesion.modulos)) return false;
  if (await dataAccess.bajaEnDiaCerrado("ingresos", ids)) return false;
  return dataAccess.deleteIngresos(ids);
}
