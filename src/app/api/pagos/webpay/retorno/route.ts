import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pagosWebpay, servicios } from "@/db/schema";
import { aplicarPagoAprobado } from "@/lib/pagos";
import { webpayTransaction } from "@/lib/transbank";

export const runtime = "nodejs";

function redirectResultado(origin: string, estado: string, buyOrder?: string): NextResponse {
  const url = new URL("/pagar/resultado", origin);
  url.searchParams.set("estado", estado);
  if (buyOrder) url.searchParams.set("buyOrder", buyOrder);
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
  if (!tokenWs && tbkToken) {
    if (tbkOrdenCompra) {
      try {
        await db
          .update(pagosWebpay)
          .set({ estado: "anulada", actualizadoEn: new Date().toISOString() })
          .where(eq(pagosWebpay.buyOrder, tbkOrdenCompra));
      } catch (error) {
        console.error("Error marcando pago anulado", error);
      }
    }
    return redirectResultado(origin, "anulado", tbkOrdenCompra || undefined);
  }

  if (!tokenWs) {
    return redirectResultado(origin, "error");
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

  const { buy_order: buyOrder, response_code: responseCode, authorization_code: authorizationCode } = commitResult;

  // Todo el procesamiento del callback (chequeo de "¿ya procesado?", aplicar
  // el pago y marcar el resultado) corre en una sola transacción con la fila
  // de pagosWebpay bloqueada (FOR UPDATE): sin esto, una recarga de esta
  // misma página o un reintento del callback de Transbank para el mismo
  // buy_order podían pasar el chequeo `pago.estado !== "iniciada"` antes de
  // que el primero terminara de escribir, y aplicarPagoAprobado() volvía a
  // extender el vencimiento del cliente gratis (sin que Transbank cobrara de
  // nuevo, ya que el cargo ya estaba hecho) cada vez que se repetía.
  let resultado: { tipo: "ok" | "rechazado" | "ya-procesado" | "no-encontrado"; estadoPrevio?: string };
  try {
    resultado = await db.transaction(async (tx) => {
      const [pago] = await tx.select().from(pagosWebpay).where(eq(pagosWebpay.buyOrder, buyOrder)).for("update").limit(1);
      if (!pago) return { tipo: "no-encontrado" as const };
      if (pago.estado !== "iniciada") {
        // Ya procesado (doble callback/retry de Transbank): no repetir la venta.
        return { tipo: "ya-procesado" as const, estadoPrevio: pago.estado };
      }

      if (responseCode !== 0) {
        await tx
          .update(pagosWebpay)
          .set({ estado: "rechazada", responseCode, actualizadoEn: new Date().toISOString() })
          .where(eq(pagosWebpay.buyOrder, buyOrder));
        return { tipo: "rechazado" as const };
      }

      // Aprobado: mismo patrón que el webhook de WooCommerce (buscar/crear
      // cliente, extender vencimiento, insertar venta) — acá con la garantía
      // extra de que Transbank ya confirmó el cobro antes de este punto.
      const esServicioAdicional = pago.tipo === "servicio";
      const [servicio] = esServicioAdicional
        ? await tx.select({ nombre: servicios.nombre }).from(servicios).where(eq(servicios.id, pago.servicioId ?? "")).limit(1)
        : [];
      const tipoVentaServicio = servicio ? `${servicio.nombre} (Web)` : "Servicio adicional (Web)";

      let ventaId: string | null = "wp-" + buyOrder;
      try {
        // Savepoint aparte: si esto falla, Transbank ya cobró, así que el
        // pago igual se marca "aprobada" abajo (para no perder el registro
        // ni volver a cobrar en un reintento) pero con ventaId null, para
        // que quede visible que requiere revisión manual en vez de simular
        // una venta que nunca se creó.
        await tx.transaction(async (tx2) => {
          await aplicarPagoAprobado(
            {
              patente: pago.patente,
              monto: pago.monto,
              ventaId: ventaId as string,
              metodoPago: "tarjeta",
              creadoPor: "Automático (Webpay)",
              esServicioAdicional,
              tipoVentaNuevo: esServicioAdicional ? tipoVentaServicio : "Plan nuevo (Web)",
              tipoVentaExistente: esServicioAdicional ? tipoVentaServicio : "Renovación (Web)",
            },
            tx2
          );
        });
      } catch (errorAplicar) {
        console.error(
          "Pago Webpay aprobado por Transbank pero no se pudo aplicar en la base (cliente sin extender/venta) — requiere revisión manual",
          buyOrder,
          errorAplicar
        );
        ventaId = null;
      }

      await tx
        .update(pagosWebpay)
        .set({
          estado: "aprobada",
          responseCode,
          authorizationCode: authorizationCode || null,
          ventaId,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(pagosWebpay.buyOrder, buyOrder));

      return { tipo: "ok" as const };
    });
  } catch (error) {
    console.error("Error procesando el callback de pago Webpay", buyOrder, error);
    return redirectResultado(origin, "error", buyOrder);
  }

  if (resultado.tipo === "no-encontrado") {
    console.error("Pago Webpay no encontrado para buy_order", buyOrder);
    return redirectResultado(origin, "error");
  }
  if (resultado.tipo === "ya-procesado") {
    return redirectResultado(origin, resultado.estadoPrevio === "aprobada" ? "ok" : "error", buyOrder);
  }
  if (resultado.tipo === "rechazado") {
    return redirectResultado(origin, "error", buyOrder);
  }
  return redirectResultado(origin, "ok", buyOrder);
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
