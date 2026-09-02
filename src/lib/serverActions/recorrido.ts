"use server";

import * as dataAccess from "@/lib/dataAccess";
import { sesionActual } from "@/lib/session";
import type { ComunicacionPeriodo, ComunicacionesCliente, ConteoDisparos, ConversacionSinFicha } from "@/lib/helpers/recorrido";

// El embudo vive en Estadísticas y la línea de tiempo se abre desde la ficha
// del cliente, así que cualquiera de los dos módulos habilita estas lecturas:
// gatear solo con "clientes" dejaría el detalle vacío justo al bajar desde el
// embudo, y gatear solo con "stats" lo rompería en el módulo Clientes.
async function puedeVerRecorrido(): Promise<boolean> {
  const sesion = await sesionActual();
  return !!sesion && (sesion.modulos.includes("stats") || sesion.modulos.includes("clientes"));
}

export async function listarComunicacionesPeriodo(desdeISO: string, hastaISO: string): Promise<ComunicacionPeriodo[]> {
  if (!(await puedeVerRecorrido())) return [];
  return dataAccess.listarComunicacionesPeriodo(desdeISO, hastaISO);
}

/**
 * Todo lo que la pantalla necesita del servidor y no viaja ya en AppData:
 * cuánto disparó cada regla, los cobros del período y qué patentes tienen
 * cobro automático andando. Va en una sola llamada porque se muestran juntos
 * — un cobro rechazado sin su aviso es UN hallazgo, no dos datos sueltos.
 */
export async function estadoDelEmbudo(
  desdeISO: string,
  hastaISO: string
): Promise<{
  conteos: { correo: ConteoDisparos[]; whatsapp: ConteoDisparos[] };
  cobros: { aprobados: number; rechazados: number };
  patentesAutopago: string[];
  sinFicha: ConversacionSinFicha[];
}> {
  if (!(await puedeVerRecorrido())) {
    return { conteos: { correo: [], whatsapp: [] }, cobros: { aprobados: 0, rechazados: 0 }, patentesAutopago: [], sinFicha: [] };
  }
  const [conteos, cobros, patentesAutopago, sinFicha] = await Promise.all([
    dataAccess.contarDisparosPorRegla(desdeISO, hastaISO),
    dataAccess.contarCobrosPeriodo(desdeISO, hastaISO),
    dataAccess.listarPatentesConAutopago(),
    // Sin rango: quien escribió hace dos meses y nunca volvió sigue siendo un
    // prospecto sin trabajar, no deja de serlo por caer fuera del período.
    dataAccess.listarConversacionesSinFicha(),
  ]);
  return { conteos, cobros, patentesAutopago, sinFicha };
}

export async function listarComunicacionesCliente(
  clienteId: string,
  telefono: string | undefined,
  patente: string
): Promise<ComunicacionesCliente> {
  if (!(await puedeVerRecorrido())) return { correos: [], whatsapp: [], cobros: [] };
  return dataAccess.listarComunicacionesCliente(clienteId, telefono, patente);
}
