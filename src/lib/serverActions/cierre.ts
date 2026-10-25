"use server";

import * as dataAccess from "@/lib/dataAccess";
import {
  ahoraEnSantiago,
  diaCaja,
  finHorarioOperador,
  puedeCerrarCaja,
  puedeCerrarCajaDeHoy,
  puedeReabrirCaja,
} from "@/lib/helpers";
import { enviarPushAGerencia } from "@/lib/push/enviar";
import { sesionActual } from "@/lib/session";
import type { CierreCaja } from "@/types";

type Resultado = { ok: true } | { ok: false; error: string };

// Cerrar un día deja congelado todo lo que pasó ese día, así que exige el
// módulo "arqueo" — este es el único lugar que de verdad puede impedirlo, ya
// que todo Server Action queda invocable por POST directo (ver el comentario
// de serverActions/index). `cerradoPor`/`cerradoEn` los pone el servidor:
// quién cerró y cuándo no puede venir del cliente. Reabrirlo solo lo puede
// Gerencia (ver reabrirCaja).
export async function cerrarCaja(cierre: CierreCaja): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion || !puedeCerrarCaja(sesion.modulos)) return { ok: false, error: "Tu perfil no tiene permiso para cerrar la caja." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cierre.fecha)) return { ok: false, error: "Fecha inválida." };
  const hoy = diaCaja(new Date().toISOString());
  // Un día futuro no tiene caja que cuadrar, y cerrarlo dejaría bloqueado por
  // adelantado un día en que todavía hay que operar.
  if (cierre.fecha > hoy) return { ok: false, error: "No se puede cerrar un día que todavía no llega." };
  // Lo mismo con hoy mientras el local sigue abierto: el POS y el túnel
  // quedarían bloqueados el resto del día.
  if (cierre.fecha === hoy) {
    const config = await dataAccess.getConfig();
    const ahora = ahoraEnSantiago();
    if (!puedeCerrarCajaDeHoy(config, ahora)) {
      return { ok: false, error: `La caja de hoy se puede cerrar recién después de las ${finHorarioOperador(config, ahora)}, al terminar el horario de funcionamiento.` };
    }
  }
  const ok = await dataAccess.insertCierreCaja({
    ...cierre,
    cerradoPor: sesion.nombre,
    cerradoEn: new Date().toISOString(),
  });
  return ok ? { ok: true } : { ok: false, error: "No se pudo cerrar la caja. Puede que el día ya esté cerrado." };
}

// Quien cierra la caja no puede reabrirla: deja el pedido anotado en el
// cierre y le llega un push a Gerencia, que lo aprueba desde Cierre de Caja.
// Solo el día de hoy: reabrir un día pasado descuadraría un resumen ya
// usado para contabilidad.
export async function solicitarReaperturaCaja(fecha: string, motivo: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion || !puedeCerrarCaja(sesion.modulos)) return { ok: false, error: "Tu perfil no puede pedir la reapertura de la caja." };
  if (fecha !== diaCaja(new Date().toISOString())) return { ok: false, error: "Solo se puede pedir reabrir la caja de hoy." };
  const texto = motivo.trim();
  if (!texto) return { ok: false, error: "Escribe el motivo: es lo que lee Gerencia para aprobarlo." };
  if (!(await dataAccess.marcarReaperturaSolicitada(fecha, sesion.nombre, texto))) {
    return { ok: false, error: "La caja de hoy no está cerrada." };
  }
  try {
    await enviarPushAGerencia({ title: "Piden reabrir la caja", body: `${sesion.nombre}: ${texto}` });
  } catch (error) {
    // El pedido ya quedó guardado y Gerencia lo ve en Cierre de Caja.
    console.error("Error avisando a Gerencia la solicitud de reapertura de caja", error);
  }
  return { ok: true };
}

export async function reabrirCaja(fecha: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion || !puedeReabrirCaja(sesion.nombre)) return { ok: false, error: "Solo Gerencia puede reabrir la caja." };
  if (fecha !== diaCaja(new Date().toISOString())) return { ok: false, error: "Solo se puede reabrir la caja de hoy." };
  if (!(await dataAccess.deleteCierreCaja(fecha))) return { ok: false, error: "La caja de hoy ya estaba abierta." };
  return { ok: true };
}
