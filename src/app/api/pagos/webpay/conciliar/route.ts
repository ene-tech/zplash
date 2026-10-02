import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { pagosWebpay } from "@/db/schema";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { aplicarRetornoWebpay } from "@/lib/pagos";
import { webpayTransaction } from "@/lib/transbank";

export const runtime = "nodejs";
export const maxDuration = 300;

// Más joven que esto puede ser un cliente todavía en la página de Transbank.
const ESPERA_MS = 15 * 60 * 1000;
// Transbank responde status() hasta 7 días después de crear la transacción.
const VENTANA_MS = 7 * 24 * 60 * 60 * 1000;
// Estados de Transbank que dicen que el cliente no pagó.
const SIN_PAGO = new Set(["INITIALIZED", "FAILED", "REVERSED", "NULLIFIED"]);

/**
 * Concilia los pagos Webpay que quedaron "iniciada". Dos casos:
 * - El cliente pagó y cerró el navegador antes de volver: nadie llamó a
 *   commit(), y sin commit Transbank reversa el cargo. Acá se confirma
 *   (commit) y se aplica igual que en el retorno.
 * - El retorno sí hizo commit() pero la escritura en la base se cayó: el
 *   commit de acá falla (ya confirmado), así que se consulta status() y, si
 *   está AUTHORIZED, se aplica.
 * Es la misma función del retorno (aplicarRetornoWebpay), que no aplica dos
 * veces. Si Transbank dice que no hubo pago queda "anulada" para no volver a
 * consultarla; si no contesta, se deja para la próxima vuelta: nunca se anula
 * un pago sin que Transbank lo confirme.
 */
export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const db = getDb();
  const ahora = Date.now();
  const pendientes = await db
    .select({ buyOrder: pagosWebpay.buyOrder, token: pagosWebpay.token })
    .from(pagosWebpay)
    .where(
      and(
        eq(pagosWebpay.estado, "iniciada"),
        isNotNull(pagosWebpay.token),
        lt(pagosWebpay.creadoEn, new Date(ahora - ESPERA_MS).toISOString()),
        gte(pagosWebpay.creadoEn, new Date(ahora - VENTANA_MS).toISOString())
      )
    );

  const resultados: { buyOrder: string; resultado: string }[] = [];
  for (const { buyOrder, token } of pendientes) {
    try {
      let commit: { response_code: number; authorization_code?: string; amount: number } | null = null;
      try {
        commit = await webpayTransaction().commit(token as string);
      } catch {
        // Ya confirmado (por el retorno) o vencido/abandonado: lo dice status().
      }
      if (commit) {
        console.error("Pago Webpay que el retorno no alcanzó a confirmar — conciliado", buyOrder, commit.response_code);
        const r = await aplicarRetornoWebpay(buyOrder, commit);
        resultados.push({ buyOrder, resultado: r.tipo });
        continue;
      }
      const st = await webpayTransaction().status(token as string);
      if (st?.status === "AUTHORIZED" && st.response_code === 0) {
        console.error("Pago Webpay cobrado que había quedado sin aplicar — conciliado", buyOrder);
        const r = await aplicarRetornoWebpay(buyOrder, st);
        resultados.push({ buyOrder, resultado: r.tipo });
      } else if (SIN_PAGO.has(st?.status)) {
        await db
          .update(pagosWebpay)
          .set({ estado: "anulada", actualizadoEn: new Date().toISOString() })
          .where(and(eq(pagosWebpay.buyOrder, buyOrder), eq(pagosWebpay.estado, "iniciada")));
        resultados.push({ buyOrder, resultado: "anulada" });
      }
    } catch (error) {
      console.error("No se pudo conciliar el pago Webpay", buyOrder, error);
      resultados.push({ buyOrder, resultado: "error" });
    }
  }

  return NextResponse.json({ ok: true, revisados: pendientes.length, resultados });
}
