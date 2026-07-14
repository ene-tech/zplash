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

  const [pago] = await db.select().from(pagosWebpay).where(eq(pagosWebpay.buyOrder, buyOrder)).limit(1);
  if (!pago) {
    console.error("Pago Webpay no encontrado para buy_order", buyOrder);
    return redirectResultado(origin, "error");
  }
  if (pago.estado !== "iniciada") {
    // Ya procesado (doble callback/retry de Transbank): no repetir la venta.
    return redirectResultado(origin, pago.estado === "aprobada" ? "ok" : "error", buyOrder);
  }

  if (responseCode !== 0) {
    try {
      await db
        .update(pagosWebpay)
        .set({ estado: "rechazada", responseCode, actualizadoEn: new Date().toISOString() })
        .where(eq(pagosWebpay.buyOrder, buyOrder));
    } catch (error) {
      console.error("Error marcando pago rechazado", error);
    }
    return redirectResultado(origin, "error", buyOrder);
  }

  // Aprobado: mismo patrón que el webhook de WooCommerce (buscar/crear
  // cliente, extender vencimiento, insertar venta) — acá con la garantía
  // extra de que Transbank ya confirmó el cobro antes de este punto.
  try {
    const esServicioAdicional = pago.tipo === "servicio";
    const [servicio] = esServicioAdicional
      ? await db.select({ nombre: servicios.nombre }).from(servicios).where(eq(servicios.id, pago.servicioId ?? "")).limit(1)
      : [];
    const tipoVentaServicio = servicio ? `${servicio.nombre} (Web)` : "Servicio adicional (Web)";

    const ventaId = "wp-" + buyOrder;
    await aplicarPagoAprobado({
      patente: pago.patente,
      monto: pago.monto,
      ventaId,
      metodoPago: "tarjeta",
      creadoPor: "Automático (Webpay)",
      esServicioAdicional,
      tipoVentaNuevo: esServicioAdicional ? tipoVentaServicio : "Plan nuevo (Web)",
      tipoVentaExistente: esServicioAdicional ? tipoVentaServicio : "Renovación (Web)",
    });

    await db
      .update(pagosWebpay)
      .set({
        estado: "aprobada",
        responseCode,
        authorizationCode: authorizationCode || null,
        ventaId,
        actualizadoEn: new Date().toISOString(),
      })
      .where(eq(pagosWebpay.buyOrder, buyOrder));
  } catch (error) {
    console.error("Error creando venta/cliente tras pago Webpay aprobado", error);
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
