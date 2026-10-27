"use server";

import {
  emitirFacturaDeVentas,
  emitirNotaCreditoDeFactura,
  reenviarFactura,
  type ResultadoCorreoFactura,
  type ResultadoFactura,
  type ResultadoNotaCredito,
} from "@/lib/facturacion";
import { MODULOS_NOTA_CREDITO, type MotivoNotaCredito } from "@/lib/logic/empresas";
import { tieneAlgunModulo } from "@/lib/session";

export type { ResultadoCorreoFactura, ResultadoFactura, ResultadoNotaCredito };

// Botón "Emitir factura" del cierre. La lógica vive en @/lib/facturacion,
// compartida con la factura automática al vender.
export async function emitirFacturaVentas(ventaIds: string[]): Promise<ResultadoFactura> {
  if (!(await tieneAlgunModulo(["cierre", "arqueo", "permisos"]))) return { ok: false, error: "Sin permiso" };
  return emitirFacturaDeVentas(ventaIds);
}

/** Reenvía por correo una factura ya emitida (botón en la ficha de la empresa). */
export async function reenviarFacturaPorCorreo(folio: number): Promise<ResultadoCorreoFactura> {
  if (!(await tieneAlgunModulo(["empresas_facturacion", "cierre", "arqueo", "permisos"]))) return { ok: false, error: "Sin permiso" };
  return reenviarFactura(folio);
}

/** Nota de crédito que anula una factura emitida (pestaña Facturas). Mismo
 * permiso que emitir. */
export async function emitirNotaCredito(facturaFolio: number, motivo: MotivoNotaCredito, glosa: string): Promise<ResultadoNotaCredito> {
  if (!(await tieneAlgunModulo(MODULOS_NOTA_CREDITO))) return { ok: false, error: "Sin permiso" };
  if (!Number.isInteger(facturaFolio) || facturaFolio <= 0) return { ok: false, error: "Folio inválido" };
  return emitirNotaCreditoDeFactura(facturaFolio, motivo, String(glosa ?? ""));
}
