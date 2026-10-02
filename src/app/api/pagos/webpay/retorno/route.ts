import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pagosWebpay, pagosWebpayItems } from "@/db/schema";
import { aplicarRetornoWebpay, TIPOS_PROMO_CUENTA, type ResultadoRetornoWebpay } from "@/lib/pagos";
import { webpayTransaction } from "@/lib/transbank";

export const runtime = "nodejs";

function redirectResultado(origin: string, estado: string, buyOrder?: string, volverCuenta?: boolean): NextResponse {
  const url = new URL("/pagar/resultado", origin);
  url.searchParams.set("estado", estado);
  if (buyOrder) url.searchParams.set("buyOrder", buyOrder);
  if (volverCuenta) url.searchParams.set("origen", "cuenta");
  return NextResponse.redirect(url, { status: 303 });
}

// Desde la API 1.1 de Transbank el retorno normal (pago aprobado o
// rechazado) llega por GET; solo la cancelación en el ambiente de
// integración llega por POST. Como el método varía según versión/ambiente,
// se aceptan ambos y se delega acá con los mismos tres campos.
async function procesarRetorno(
  origin: string,
  tokenWs: string | null,
  tbkToken: string | null,
  tbkOrdenCompra: string | null
): Promise<NextResponse> {
  const db = getDb();

  // El cliente canceló/abandonó en la página de Transbank: no viene token_ws.
  //
  // Este es el único camino de esta ruta que escribe sin que Transbank haya
  // confirmado nada, y llega por GET — o sea, cualquiera puede invocarlo con
  // los parámetros que quiera. Por eso el UPDATE exige las tres condiciones:
  // que el buy_order exista, que el TBK_TOKEN sea el mismo que se guardó al
  // crear la transacción (ver webpay/crear) y que siga "iniciada". Sin el
  // chequeo del token alcanzaba con adivinar un buy_order —"wp" + Date.now()
  // en base36, o sea predecible al milisegundo— para dejar en "anulada" el
  // pago en curso de otra persona: Transbank le cobraba igual y su retorno
  // real caía en la rama "ya-procesado", sin aplicar nunca el plan.
  if (!tokenWs && tbkToken) {
    let volverCuenta = false;
    if (tbkOrdenCompra) {
      try {
        const [fila] = await db
          .update(pagosWebpay)
          .set({ estado: "anulada", actualizadoEn: new Date().toISOString() })
          .where(
            and(
              eq(pagosWebpay.buyOrder, tbkOrdenCompra),
              eq(pagosWebpay.token, tbkToken),
              eq(pagosWebpay.estado, "iniciada")
            )
          )
          .returning({ tipo: pagosWebpay.tipo });
        volverCuenta = !!fila && TIPOS_PROMO_CUENTA.has(fila.tipo);
      } catch (error) {
        console.error("Error marcando pago anulado", error);
      }
    }
    return redirectResultado(origin, "anulado", tbkOrdenCompra || undefined, volverCuenta);
  }

  if (!tokenWs) {
    return redirectResultado(origin, "error");
  }

  // ¿Ya procesado? Se mira ANTES del commit: commit() de un token ya
  // confirmado falla, así que el cliente que recargaba esta página veía
  // "error" sobre un pago aprobado. Con la fila ya resuelta se responde con lo
  // que quedó guardado, sin volver a hablar con Transbank.
  const [previo] = await db
    .select({ buyOrder: pagosWebpay.buyOrder, estado: pagosWebpay.estado, tipo: pagosWebpay.tipo })
    .from(pagosWebpay)
    .where(eq(pagosWebpay.token, tokenWs))
    .limit(1);
  if (previo && previo.estado !== "iniciada") {
    const items = await db.select({ tipo: pagosWebpayItems.tipo }).from(pagosWebpayItems).where(eq(pagosWebpayItems.buyOrder, previo.buyOrder));
    const volverCuenta = items.length > 0 ? items.some((i) => TIPOS_PROMO_CUENTA.has(i.tipo)) : TIPOS_PROMO_CUENTA.has(previo.tipo);
    return redirectResultado(origin, previo.estado === "aprobada" ? "ok" : "error", previo.buyOrder, volverCuenta);
  }

  let commitResult: {
    response_code: number;
    buy_order: string;
    authorization_code?: string;
    amount: number;
  };
  try {
    commitResult = await webpayTransaction().commit(tokenWs);
  } catch (error) {
    console.error("Error al confirmar transacción Webpay", error);
    return redirectResultado(origin, "error");
  }

  const buyOrder = commitResult.buy_order;

  let resultado: ResultadoRetornoWebpay;
  try {
    resultado = await aplicarRetornoWebpay(buyOrder, commitResult);
  } catch (error) {
    console.error("Error procesando el callback de pago Webpay", buyOrder, error);
    return redirectResultado(origin, "error", buyOrder);
  }

  if (resultado.tipo === "no-encontrado") {
    console.error("Pago Webpay no encontrado para buy_order", buyOrder);
    return redirectResultado(origin, "error");
  }
  if (resultado.tipo === "ya-procesado") {
    return redirectResultado(origin, resultado.estadoPrevio === "aprobada" ? "ok" : "error", buyOrder, resultado.volverCuenta);
  }
  if (resultado.tipo === "rechazado" || resultado.tipo === "monto-no-coincide") {
    return redirectResultado(origin, "error", buyOrder, resultado.volverCuenta);
  }
  return redirectResultado(origin, "ok", buyOrder, resultado.volverCuenta);
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  return procesarRetorno(request.nextUrl.origin, p.get("token_ws"), p.get("TBK_TOKEN"), p.get("TBK_ORDEN_COMPRA"));
}

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectResultado(origin, "error");
  }
  const tokenWs = form.get("token_ws");
  const tbkToken = form.get("TBK_TOKEN");
  const tbkOrdenCompra = form.get("TBK_ORDEN_COMPRA");
  return procesarRetorno(
    origin,
    typeof tokenWs === "string" ? tokenWs : null,
    typeof tbkToken === "string" ? tbkToken : null,
    typeof tbkOrdenCompra === "string" ? tbkOrdenCompra : null
  );
}
