"use server";

import { emitirFacturaDeVentas, reenviarFactura, type ResultadoCorreoFactura, type ResultadoFactura } from "@/lib/facturacion";
import { tieneAlgunModulo } from "@/lib/session";

export type { ResultadoCorreoFactura, ResultadoFactura };

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
