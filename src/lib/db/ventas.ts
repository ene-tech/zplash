"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo, tieneSesionValida } from "@/lib/session";
import type { Venta } from "@/types";

export async function insertVentas(rows: Venta[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.insertVentas(rows);
}

export async function upsertVentas(rows: Venta[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertVentas(rows);
}

// Gateada con "permisos" (Gerencia), a diferencia de insertVentas/
// upsertVentas: borrar un servicio ya registrado (y el pago Transbank que
// haya generado, si tuvo uno) es destructivo e irreversible, no una
// operación que cualquier operador con acceso a Servicios Adicionales deba
// poder hacer.
export async function deleteVentas(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("permisos"))) return false;
  return dataAccess.deleteVentas(ids);
}
