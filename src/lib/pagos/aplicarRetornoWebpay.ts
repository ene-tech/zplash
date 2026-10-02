import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones, pagosWebpay, pagosWebpayItems, servicios } from "@/db/schema";
import { getConfig } from "@/lib/dataAccess/config";
import { cuponToRow } from "@/lib/dataAccess/cupones";
import { cuponesPromo2Lavados, sigueVigenteHoy } from "@/lib/helpers";
import { aplicarPagoAprobado } from "./aplicarPagoAprobado";
import { aplicarPagoPackEmpresa } from "./aplicarPagoPackEmpresa";
import { aplicarUpgradePlan } from "./aplicarUpgradePlan";
import { otorgarTicketReactivacion } from "./ticketReactivacion";

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
export const TIPOS_PROMO_CUENTA = new Set(["renovacion_temprana", "reactivacion", "upgrade_plan"]);

export type ResultadoRetornoWebpay = {
  tipo: "ok" | "rechazado" | "ya-procesado" | "no-encontrado" | "monto-no-coincide";
  estadoPrevio?: string;
  volverCuenta?: boolean;
  // Promo de reactivación: se decide DENTRO de la transacción (hay que mirar
  // el vencimiento antes de que aplicarPagoAprobado lo extienda) pero se
  // emite FUERA, porque otorgarTicketReactivacion abre su propia conexión y
  // manda un correo — mismo criterio que los dos caminos Oneclick.
  ticketPara?: { patente: string; email: string | null } | null;
};

/**
 * Aplica en la base el resultado de un pago Webpay Plus que Transbank ya
 * confirmó (commit) — el retorno del navegador y la conciliación
 * (/api/pagos/webpay/conciliar) pasan por acá, así que un pago cobrado cuyo
 * retorno se cayó a mitad de camino se aplica igual, y una sola vez.
 */
export async function aplicarRetornoWebpay(
  buyOrder: string,
  commit: { response_code: number; authorization_code?: string; amount: number }
): Promise<ResultadoRetornoWebpay> {
  const db = getDb();
  const { response_code: responseCode, authorization_code: authorizationCode } = commit;

  // Todo el procesamiento del callback (chequeo de "¿ya procesado?", aplicar
  // el pago y marcar el resultado) corre en una sola transacción con la fila
  // de pagosWebpay bloqueada (FOR UPDATE): sin esto, una recarga de esta
  // misma página o un reintento del callback de Transbank para el mismo
  // buy_order podían pasar el chequeo `pago.estado !== "iniciada"` antes de
  // que el primero terminara de escribir, y aplicarPagoAprobado() volvía a
  // extender el vencimiento del cliente gratis (sin que Transbank cobrara de
  // nuevo, ya que el cargo ya estaba hecho) cada vez que se repetía.
  const resultado: ResultadoRetornoWebpay = await db.transaction(async (tx) => {
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

    // Lo que Transbank dice haber cobrado tiene que ser lo que se registró
    // al crear la transacción (ver webpay/crear, que calcula todos los
    // montos server-side). Si no coincide, no se aplica NADA: extender un
    // plan contra un cobro por otro monto es peor que dejarlo pendiente de
    // revisión, y el cargo ya está hecho igual, así que la fila se marca
    // aprobada sin venta para que quede visible en vez de perderse.
    if (commit.amount !== pago.monto) {
      console.error(
        "Monto de Transbank distinto del registrado — no se aplica el pago, requiere revisión manual",
        buyOrder,
        { registrado: pago.monto, informado: commit.amount }
      );
      await tx
        .update(pagosWebpay)
        .set({
          estado: "aprobada",
          responseCode,
          authorizationCode: authorizationCode || null,
          ventaId: null,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(pagosWebpay.buyOrder, buyOrder));
      return { tipo: "monto-no-coincide" as const, volverCuenta };
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

    let ticketPara: { patente: string; email: string | null } | null = null;
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
        // Upgrade a Plan X5 (ver calcularOfertasPlan/aplicarUpgradePlan):
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
                // Cupón que /crear ya restó del monto cobrado: acá se quema,
                // en la misma transacción que crea la venta.
                cuponCodigo: item.cuponCodigo,
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

      // La Promo 2 Lavados entra como servicio adicional a propósito: no
      // toca plan ni vencimiento (son 2 tickets para la patente, ver abajo).
      const esServicioAdicional =
        item.tipo === "servicio" || item.tipo === "lavado_unico" || item.tipo === "aspirado" || item.tipo === "promo_2_lavados";
      const tipoVenta = esServicioAdicional ? `${item.nombre} (Web)` : TIPO_VENTA_PROMO_CUENTA[item.tipo];
      // Pagar el plan vencido por la pasarela (OfertaPlan.pagoVencido, el
      // único ítem de plan que todavía pasa por Webpay) deja el mismo lavado
      // full túnel gratis que reactivarlo contra una tarjeta inscrita — ver
      // /api/cliente/mi-cuenta/cobrar-oferta: es el mismo hecho, y sin esto
      // la promo dependía de por cuál puerta entró el cliente.
      //
      // El vencimiento hay que MIRARLO antes de aplicar el pago (que es lo
      // que lo extiende), pero el ticket recién se confirma si el ítem se
      // aplicó de verdad: si el savepoint de abajo se cae, el plan no quedó
      // extendido y mandarle "gracias por reactivar tu plan" con un lavado
      // gratis quemaría la promo —que es una sola por cliente— por un plan
      // que no existe.
      let ticketDeEsteItem: { patente: string; email: string | null } | null = null;
      if (!esServicioAdicional && !ticketPara) {
        const [antes] = await tx
          .select({ vencimiento: clientes.vencimiento, email: clientes.email })
          .from(clientes)
          .where(eq(clientes.patente, pago.patente))
          .limit(1);
        if (antes && !sigueVigenteHoy(antes.vencimiento)) ticketDeEsteItem = { patente: pago.patente, email: antes.email };
      }
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
              // Solo alcanza a filas viejas: webpay/crear ya no acepta
              // "reactivacion" (esa promo se cobra por Oneclick, ver
              // cobrarOfertaOneclick). Va igual porque el mapeo de tipos de
              // arriba tampoco lo dejó atrás. El vencido que SÍ paga por
              // Webpay hoy entra como "renovacion" (OfertaPlan.pagoVencido)
              // y ese conserva su ciclo a propósito.
              reiniciarCiclo: item.tipo === "reactivacion",
              tipoDocumento: item.tipoDocumento,
              razonSocial: item.razonSocial,
              rut: item.rut,
              direccion: item.direccion,
              giro: item.giro,
              email: item.email,
              cuponCodigo: item.cuponCodigo,
            },
            tx2
          );
          if (item.tipo === "promo_2_lavados") {
            // Los 2 tickets de la promo van en el mismo savepoint que la
            // venta: o quedan los dos o no queda ninguno. El correo del
            // checkout solo viene con Factura; con Boleta se toma el de la
            // ficha (si tiene) para que igual los vea en "Mis tickets" de Mi
            // Cuenta — en el túnel se canjean por patente, sin código (ver
            // ticketsVigentesDePatente). Los códigos se chequean solo contra
            // los recién generados, no contra la tabla entera (que se leía
            // completa en cada compra): un choque de 6 caracteres es rarísimo
            // y si pasa se generan otros.
            const [ficha] = await tx2.select({ email: clientes.email }).from(clientes).where(eq(clientes.patente, pago.patente)).limit(1);
            const generar = () =>
              cuponesPromo2Lavados({
                patente: pago.patente,
                email: item.email || ficha?.email,
                precio: item.monto,
                existentes: new Set(),
                creadoPor: "Automático (Webpay)",
                idBase: item.id,
              });
            let tickets = generar();
            while ((await tx2.select({ codigo: cupones.codigo }).from(cupones).where(inArray(cupones.codigo, tickets.map((t) => t.codigo)))).length) {
              tickets = generar();
            }
            await tx2.insert(cupones).values(tickets.map(cuponToRow));
          }
        });
        if (ticketDeEsteItem) ticketPara = ticketDeEsteItem;
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

    return { tipo: "ok" as const, volverCuenta, ticketPara };
  });

  // El cargo ya está hecho y el plan ya quedó aplicado: que no salga el
  // ticket no puede tumbar nada, se registra y se sigue (mismo criterio que
  // /api/pagos/oneclick/inscripcion/retorno). otorgarTicketReactivacion es
  // una sola vez por cliente, así que no puede duplicar el del otro camino.
  if (resultado.tipo === "ok" && resultado.ticketPara) {
    const { patente, email } = resultado.ticketPara;
    try {
      await otorgarTicketReactivacion({ patente, email, creadoPor: "Promo reactivación (Webpay)" });
    } catch (error) {
      console.error("No se pudo emitir el ticket de la promo de reactivación", patente, error);
    }
  }

  return resultado;
}
