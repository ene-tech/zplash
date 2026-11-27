import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cobrosOneclick, comprasOneclick, pagosWebpay } from "@/db/schema";

/** Monto de una compra web aprobada, para el pixel de Meta: Webpay
 * (pagosWebpay), primer cobro tras inscribir la tarjeta (cobrosOneclick) o
 * pago de un toque del link SMS (comprasOneclick). Solo filas aprobadas, así
 * un buyOrder inventado no crea ventas, y solo de las últimas 24 h: Meta
 * descarta repetidos (mismo event_id) solo por ~48 h, así que reabrir la
 * página de resultado una semana después, o reenviar un buyOrder viejo a
 * /api/meta/evento, contaría una compra nueva. null si no hay o si la base
 * falla. */
export async function montoCompraAprobada(buyOrder: string): Promise<number | null> {
  const reciente = sql`now() - interval '24 hours'`;
  try {
    const db = getDb();
    const [wp] = await db
      .select({ monto: pagosWebpay.monto })
      .from(pagosWebpay)
      .where(and(eq(pagosWebpay.buyOrder, buyOrder), eq(pagosWebpay.estado, "aprobada"), gte(pagosWebpay.creadoEn, reciente)))
      .limit(1);
    if (wp) return wp.monto;
    const [oc] = await db
      .select({ monto: cobrosOneclick.monto })
      .from(cobrosOneclick)
      .where(and(eq(cobrosOneclick.id, buyOrder), eq(cobrosOneclick.estado, "aprobada"), gte(cobrosOneclick.creadoEn, reciente)))
      .limit(1);
    if (oc) return oc.monto;
    const [co] = await db
      .select({ monto: comprasOneclick.monto })
      .from(comprasOneclick)
      .where(and(eq(comprasOneclick.id, buyOrder), eq(comprasOneclick.estado, "aprobada"), gte(comprasOneclick.creadoEn, reciente)))
      .limit(1);
    return co ? co.monto : null;
  } catch (error) {
    console.error("No se pudo leer el monto de la compra para Meta", buyOrder, error);
    return null;
  }
}
