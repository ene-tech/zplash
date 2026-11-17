"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneAlgunModulo, tieneModulo } from "@/lib/session";
import type { Empresa } from "@/types";

export async function upsertEmpresas(rows: Empresa[]): Promise<boolean> {
  if (await tieneModulo("empresas_facturacion")) return dataAccess.upsertEmpresas(rows);
  // El POS y el mesón necesitan poder registrar la empresa del cliente que
  // pide factura sin salir de la caja (ver PosView, PagoModal y el alta del
  // operador), pero sin darle al cajero el módulo completo de facturación:
  // solo ALTAS. Si alguna fila pisa una empresa ya registrada —por id o por
  // RUT— se rechaza el lote entero.
  if (!(await tieneAlgunModulo(["pos", "operador"]))) return false;
  if (!(await dataAccess.sonEmpresasNuevas(rows))) return false;
  return dataAccess.upsertEmpresas(rows);
}

export async function deleteEmpresas(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("empresas_facturacion"))) return false;
  return dataAccess.deleteEmpresas(ids);
}
