"use server";

import * as dataAccess from "@/lib/dataAccess";
import { diaCaja, puedeCerrarCaja } from "@/lib/helpers";
import { sesionActual } from "@/lib/session";
import type { CierreCaja } from "@/types";

// Cerrar un día es irreversible (no hay reabrirCaja() en ninguna capa) y deja
// congelado todo lo que pasó ese día, así que exige el módulo "arqueo" — este
// es el único lugar que de verdad puede impedirlo, ya que todo Server Action
// queda invocable por POST directo (ver el comentario de serverActions/index).
// `cerradoPor`/`cerradoEn` los pone el servidor: quién cerró y cuándo no
// puede venir del cliente.
export async function cerrarCaja(cierre: CierreCaja): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion || !puedeCerrarCaja(sesion.modulos)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cierre.fecha)) return false;
  // Un día futuro no tiene caja que cuadrar, y cerrarlo dejaría bloqueado por
  // adelantado un día en que todavía hay que operar.
  if (cierre.fecha > diaCaja(new Date().toISOString())) return false;
  return dataAccess.insertCierreCaja({
    ...cierre,
    cerradoPor: sesion.nombre,
    cerradoEn: new Date().toISOString(),
  });
}
