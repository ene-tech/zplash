"use server";

import * as dataAccess from "@/lib/dataAccess";
import type { DetallePagoVenta } from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";

// Detalle real de Transbank (voucher/comprobante) para el historial de
// compras de la ficha de cliente — ver ClienteInfoModal.tsx.
export async function obtenerDetallePagosVentas(ventaIds: string[]): Promise<Record<string, DetallePagoVenta>> {
  if (!(await tieneModulo("clientes"))) return {};
  return dataAccess.listarDetallePagosVentas(ventaIds);
}
