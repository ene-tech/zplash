import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pagosWebpay, pagosWebpayItems, servicios } from "@/db/schema";
import { getConfig } from "@/lib/dataAccess/config";
import { aplicarPagoAprobado, aplicarPagoPackEmpresa, aplicarUpgradePlan } from "@/lib/pagos";
import { webpayTransaction } from "@/lib/transbank";

// Label de `ventas.tipo` para las 2 promociones de Mi Cuenta que se aplican
// como una renovación normal (ver aplicarPagoAprobado más abajo) — "upgrade_plan"
// no entra acá porque tiene su propio efecto (aplicarUpgradePlan).
const TIPO_VENTA_PROMO_CUENTA: Record<string, string> = {
  renovacion_temprana: "Renovación anticipada (Web)",
  reactivacion: "Reactivación promocional (Web)",
};
// Las 3 promociones de Mi Cuenta se pagan siempre solas (TIPOS_PLAN en
// webpay/crear no deja combinar dos ítems de plan), así que `pagosWebpay.tipo`
// queda directamente en uno de estos valores — se usa para mandar de vuelta
// a Mi Cuenta en vez de a /pagar al terminar (ver redirectResultado).
const TIPOS_PROMO_CUENTA = new Set(["renovacion_temprana", "reactivacion", "upgrade_plan"]);

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
  if (!tokenWs && tbkToken) {
    let volverCuenta = false;
    if (tbkOrdenCompra) {
      try {
        const [fila] = await db
          .update(pagosWebpay)
          .set({ estado: "anulada", actualizadoEn: new Date().toISOString() })
          .where(eq(pagosWebpay.buyOrder, tbkOrdenCompra))
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
  let resultado: { tipo: "ok" | "rechazado" | "ya-procesado" | "no-encontrado"; estadoPrevio?: string; volverCuenta?: boolean };
  try {
    resultado = await db.transaction(async (tx) => {
      const [pago] = await tx.select().from(pagosWebpay).where(eq(pagosWebpay.buyOrder, buyOrder)).for("update").limit(1);
      if (!pago) return { tipo: "no-encontrado" as const };
      // Se busca el desglose de ítems ya acá (no solo más abajo, en la rama
      // "aprobado") para poder decidir `volverCuenta` en base al tipo real de
      // cada ítem: si `pagosWebpay.tipo` quedó en "carrito" (2+ ítems, ver
      // webpay/crear) por venir una promoción de Mi Cuenta junto a otro ítem
      // (ej. "aspirado"), mirar solo `pago.tipo` nunca la detectaría.
      const itemsPago = await tx.select().from(pagosWebpayItems).where(eq(pagosWebpayItems.buyOrder, buyOrder));
      const volverCuenta = itemsPago.length > 0 ? itemsPago.some((i) => TIPOS_PROMO_CUENTA.has(i.tipo)) : TIPOS_PROMO_CUENTA.has(pago.tipo);
      if (pago.estado !== "iniciada") {
        // Ya procesado (doble callback/retry de Transbank): no repetir la venta.
        return { tipo: "ya-procesado" as const, estadoPrevio: pago.estado, volverCuenta };
      }

      if (responseCode !== 0) {
        await tx
          .update(pagosWebpay)
          .set({ estado: "rechazada", responseCode, actualizadoEn: new Date().toISOString() })
          .where(eq(pagosWebpay.buyOrder, buyOrder));
        return { tipo: "rechazado" as const, volverCuenta };
      }

      // Aprobado: mismo patrón que el webhook de WooCommerce (buscar/crear
      // cliente, extender vencimiento, insertar venta) — acá con la garantía
      // extra de que Transbank ya confirmó el cobro antes de este punto.
      if (itemsPago.length === 0) {
        // Compatibilidad: fila creada por el código anterior (sin desglose
        // de ítems), que seguía "iniciada" justo en el momento del deploy.
        // Se procesa igual que antes de existir `pagosWebpayItems`.
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
      }

      // Carrito (1 o más ítems): cada uno genera su propia venta, en su
      // propio savepoint — si uno falla no se abortan los demás (Transbank
      // ya cobró el monto total de todas formas, así que no cobrarlo de
      // nuevo es lo único que importa; ese ítem queda con ventaId null para
      // revisión manual, igual que el caso de un solo ítem de arriba).
      for (const item of itemsPago) {
        let ventaId: string | null = `wp-${item.id}`;

        if (item.tipo === "pack_empresa") {
          // Pack de Tickets (cantidad libre desde CANTIDAD_MINIMA_TICKETS): no toca `clientes` ni
          // patente (no hay un auto único asociado, y clientes.patente es
          // UNIQUE) — genera el lote de cupones + la Venta con los datos de
          // facturación del checkout. Ver aplicarPagoPackEmpresa en
          // @/lib/pagos.
          try {
            await tx.transaction(async (tx2) => {
              await aplicarPagoPackEmpresa({ item, ventaId: ventaId as string, creadoPor: "Automático (Webpay)" }, tx2);
            });
          } catch (errorAplicar) {
            console.error(
              "Pago Webpay de Pack Empresa aprobado por Transbank pero no se pudo aplicar en la base (sin cupones/venta) — requiere revisión manual",
              buyOrder,
              item.id,
              errorAplicar
            );
            ventaId = null;
          }
          await tx.update(pagosWebpayItems).set({ ventaId }).where(eq(pagosWebpayItems.id, item.id));
          continue;
        }

        if (item.tipo === "upgrade_plan") {
          // Upgrade a Plan Ilimitado (ver calcularOfertasPlan/aplicarUpgradePlan):
          // no es una renovación normal — ancla el vencimiento a la fecha del
          // "Lavado único" ya pagado, no a hoy, así que tiene su propio efecto
          // en vez de pasar por aplicarPagoAprobado.
          try {
            await tx.transaction(async (tx2) => {
              const config = await getConfig();
              await aplicarUpgradePlan(
                {
                  patente: pago.patente,
                  monto: item.monto,
                  ventaId: ventaId as string,
                  metodoPago: "tarjeta",
                  creadoPor: "Automático (Webpay)",
                  horasVentanaUpgrade: config.horasVentanaUpgradePlan,
                },
                tx2
              );
            });
          } catch (errorAplicar) {
            console.error(
              "Pago Webpay de upgrade a plan aprobado por Transbank pero no se pudo aplicar en la base (cliente sin plan/venta) — requiere revisión manual",
              buyOrder,
              item.id,
              errorAplicar
            );
            ventaId = null;
          }
          await tx.update(pagosWebpayItems).set({ ventaId }).where(eq(pagosWebpayItems.id, item.id));
          continue;
        }

        const esServicioAdicional = item.tipo === "servicio" || item.tipo === "lavado_unico" || item.tipo === "aspirado";
        const tipoVenta = esServicioAdicional ? `${item.nombre} (Web)` : TIPO_VENTA_PROMO_CUENTA[item.tipo];
        try {
          await tx.transaction(async (tx2) => {
            await aplicarPagoAprobado(
              {
                patente: pago.patente,
                monto: item.monto,
                ventaId: ventaId as string,
                metodoPago: "tarjeta",
                creadoPor: "Automático (Webpay)",
                esServicioAdicional,
                tipoVentaNuevo: tipoVenta ?? "Plan nuevo (Web)",
                tipoVentaExistente: tipoVenta ?? "Renovación (Web)",
                tipoDocumento: item.tipoDocumento,
                razonSocial: item.razonSocial,
                rut: item.rut,
                direccion: item.direccion,
                giro: item.giro,
                email: item.email,
              },
              tx2
            );
          });
        } catch (errorAplicar) {
          console.error(
            "Pago Webpay aprobado por Transbank pero un ítem del carrito no se pudo aplicar en la base — requiere revisión manual",
            buyOrder,
            item.id,
            errorAplicar
          );
          ventaId = null;
        }
        await tx.update(pagosWebpayItems).set({ ventaId }).where(eq(pagosWebpayItems.id, item.id));
      }

      await tx
        .update(pagosWebpay)
        .set({
          estado: "aprobada",
          responseCode,
          authorizationCode: authorizationCode || null,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(pagosWebpay.buyOrder, buyOrder));

      return { tipo: "ok" as const, volverCuenta };
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
    return redirectResultado(origin, resultado.estadoPrevio === "aprobada" ? "ok" : "error", buyOrder, resultado.volverCuenta);
  }
  if (resultado.tipo === "rechazado") {
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
