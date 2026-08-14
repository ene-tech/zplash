import "server-only";

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { cobrosOneclick, pagosWebpay, pagosWebpayItems } from "@/db/schema";

// Detalle real de Transbank para una Venta puntual — a diferencia de
// Venta.voucher (campo de texto libre que un operador escribe a mano para
// efectivo/transferencia), esto sale directo de la respuesta de Transbank
// (authorizationCode/responseCode) guardada en pagosWebpay/cobrosOneclick al
// momento del cobro. Ventas sin Transbank detrás (WooCommerce legacy,
// registradas a mano) simplemente no tienen fila acá — la ficha del cliente
// cae al voucher manual o a "—" (ver ClienteInfoModal).
export interface DetallePagoVenta {
  origen: "webpay" | "oneclick";
  authorizationCode: string | null;
  responseCode: number | null;
  buyOrder: string;
  fecha: string;
}

/** Detalle de pago Transbank para un lote de ventas, indexado por ventaId —
 * pensado para la ficha de cliente (ClienteInfoModal), que pinta su
 * historial de compras completo de una vez. */
export async function listarDetallePagosVentas(ventaIds: string[]): Promise<Record<string, DetallePagoVenta>> {
  if (!ventaIds.length) return {};
  const db = getDb();

  const [filasWebpay, filasOneclick] = await Promise.all([
    db
      .select({
        ventaId: pagosWebpayItems.ventaId,
        authorizationCode: pagosWebpay.authorizationCode,
        responseCode: pagosWebpay.responseCode,
        buyOrder: pagosWebpay.buyOrder,
        fecha: pagosWebpay.creadoEn,
      })
      .from(pagosWebpayItems)
      .innerJoin(pagosWebpay, eq(pagosWebpay.buyOrder, pagosWebpayItems.buyOrder))
      .where(inArray(pagosWebpayItems.ventaId, ventaIds)),
    db
      .select({
        ventaId: cobrosOneclick.ventaId,
        authorizationCode: cobrosOneclick.authorizationCode,
        responseCode: cobrosOneclick.responseCode,
        buyOrder: cobrosOneclick.id,
        fecha: cobrosOneclick.creadoEn,
      })
      .from(cobrosOneclick)
      .where(inArray(cobrosOneclick.ventaId, ventaIds)),
  ]);

  const detalle: Record<string, DetallePagoVenta> = {};
  for (const f of filasWebpay) {
    if (!f.ventaId) continue;
    detalle[f.ventaId] = { origen: "webpay", authorizationCode: f.authorizationCode, responseCode: f.responseCode, buyOrder: f.buyOrder, fecha: f.fecha };
  }
  for (const f of filasOneclick) {
    if (!f.ventaId) continue;
    detalle[f.ventaId] = { origen: "oneclick", authorizationCode: f.authorizationCode, responseCode: f.responseCode, buyOrder: f.buyOrder, fecha: f.fecha };
  }
  return detalle;
}
