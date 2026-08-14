import "server-only";
import { TransactionDetail } from "transbank-sdk";
import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { cobrosOneclick, precios, suscripcionesOneclick } from "@/db/schema";
import { PLAN_ONECLICK_KEY, mesActualKey, precioPlanOneclick } from "@/lib/helpers";
import { evaluarReglasCorreoPorCobroFallido } from "@/lib/mailing/reglas";
import { oneclickChildCommerceCode, oneclickTransaction } from "@/lib/transbank";
import { evaluarReglasPorCobroFallido } from "@/lib/whatsapp/reglas";
import type { Precios } from "@/types";
import { aplicarPagoAprobado } from "./aplicarPagoAprobado";

/** Próximo ciclo mensual a partir de una fecha base, saltando meses ya
 * vencidos (ej. si el cron no corrió por 2 meses) hasta caer en el futuro. */
function proximoCicloISO(base: string | null): string {
  const hoy = new Date();
  let d = base ? new Date(base) : new Date(hoy);
  if (isNaN(d.getTime())) d = new Date(hoy);
  while (d <= hoy) {
    d.setDate(d.getDate() + 30);
  }
  return d.toISOString();
}

type SuscripcionOneclick = typeof suscripcionesOneclick.$inferSelect;

/**
 * Cobra un ciclo de una suscripción Oneclick activa: usado tanto por el cron
 * diario (/api/pagos/oneclick/cobrar) como por el reintento manual desde
 * ClienteInfoModal y por el primer cobro inmediato tras inscribir la
 * tarjeta — misma función, sin distinguir quién la llamó.
 *
 * Siempre avanza `proximoCobro` (aprobado o no): no hay reintento automático
 * por diseño, el cliente queda vencido si falla y un operador decide si
 * reintenta a mano.
 */
export async function cobrarSuscripcion(suscripcion: SuscripcionOneclick): Promise<{ estado: "aprobada" | "rechazada" }> {
  const tbkUser = suscripcion.tbkUser;
  if (!tbkUser) {
    throw new Error("Suscripción sin tbkUser, no se puede cobrar");
  }

  // Todo el ciclo (chequeo de "¿ya se cobró?", el cargo a Transbank y las
  // escrituras posteriores) corre dentro de una sola transacción con un
  // advisory lock por suscripción: el cron diario, un reintento manual desde
  // ClienteInfoModal y el primer cobro inmediato tras inscribir la tarjeta
  // pueden dispararse casi al mismo tiempo para la misma suscripción, y sin
  // este lock los tres podían pasar el chequeo "¿ya aprobado?" antes de que
  // cualquiera terminara de escribir su resultado, cobrando dos veces la
  // misma tarjeta. pg_advisory_xact_lock se libera solo al terminar la
  // transacción (commit o rollback), así que una segunda llamada concurrente
  // espera acá a que la primera termine de verdad antes de mirar el estado.
  const resultado = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${suscripcion.id}))`);

    const [filaPrecio] = await tx.select().from(precios).where(eq(precios.plan, PLAN_ONECLICK_KEY)).limit(1);
    const preciosMap: Precios = filaPrecio ? { [PLAN_ONECLICK_KEY]: { normal: filaPrecio.normal, promo: filaPrecio.promo } } : {};
    const monto = precioPlanOneclick(preciosMap);

    const buyOrder = "oc" + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
    const cicloYm = mesActualKey();
    const commerceCode = oneclickChildCommerceCode();

    // No bloquea reintentos tras un rechazo (pueden existir varias filas
    // "rechazada" el mismo ciclo) — solo evita cobrar dos veces si este ciclo
    // ya tiene una fila "aprobada". Gracias al lock de arriba, para cuando
    // una segunda llamada llega hasta acá la primera ya terminó del todo (no
    // solo insertó su fila de reserva), así que este chequeo ve el resultado
    // real del intento anterior.
    const [yaAprobado] = await tx
      .select({ id: cobrosOneclick.id })
      .from(cobrosOneclick)
      .where(and(eq(cobrosOneclick.suscripcionId, suscripcion.id), eq(cobrosOneclick.cicloYm, cicloYm), eq(cobrosOneclick.estado, "aprobada")))
      .limit(1);
    if (yaAprobado) {
      throw new Error("Este ciclo ya fue cobrado");
    }

    await tx.insert(cobrosOneclick).values({ id: buyOrder, suscripcionId: suscripcion.id, cicloYm, monto, estado: "rechazada" });

    let estado: "aprobada" | "rechazada" = "rechazada";
    let responseCode: number | null = null;
    let authorizationCode: string | null = null;
    let ventaId: string | null = null;

    try {
      const resultado = await oneclickTransaction().authorize(suscripcion.username, tbkUser, buyOrder, [
        new TransactionDetail(monto, commerceCode, buyOrder),
      ]);
      // A diferencia de Webpay Plus, el resultado no trae response_code/
      // authorization_code en la raíz: vienen por cada transacción hija dentro
      // de `details[]` (acá siempre hay una sola, la de ZPlash).
      const detalle = resultado.details?.[0];
      responseCode = detalle?.response_code ?? null;
      authorizationCode = detalle?.authorization_code || null;

      if (detalle?.response_code === 0) {
        estado = "aprobada";
        ventaId = "oc-" + buyOrder;
        try {
          // Savepoint aparte: si esto falla, Transbank ya cobró la tarjeta,
          // así que NO puede perderse el registro de que el ciclo quedó
          // "aprobada" (eso volvería a cobrar el mismo mes en el próximo
          // intento) — solo se revierte la extensión de vencimiento/venta a
          // medio aplicar, y se deja ventaId en null para que quede marcado
          // para revisión manual en vez de simular una venta que no cuadra.
          await tx.transaction(async (tx2) => {
            await aplicarPagoAprobado(
              {
                patente: suscripcion.patente,
                monto,
                ventaId: ventaId as string,
                metodoPago: "tarjeta",
                creadoPor: "Automático (Oneclick)",
                esServicioAdicional: false,
                tipoVentaNuevo: "Renovación automática (Oneclick)",
                tipoVentaExistente: "Renovación automática (Oneclick)",
              },
              tx2
            );
          });
        } catch (errorAplicar) {
          console.error(
            "Pago Oneclick aprobado por Transbank pero no se pudo aplicar en la base (cliente sin extender/venta) — requiere revisión manual",
            suscripcion.id,
            buyOrder,
            errorAplicar
          );
          ventaId = null;
        }
      }
    } catch (error) {
      console.error("Error autorizando cobro Oneclick", suscripcion.id, error);
      estado = "rechazada";
    }

    await tx
      .update(cobrosOneclick)
      .set({ estado, responseCode, authorizationCode, ventaId })
      .where(eq(cobrosOneclick.id, buyOrder));

    await tx
      .update(suscripcionesOneclick)
      .set({ proximoCobro: proximoCicloISO(suscripcion.proximoCobro), actualizadoEn: new Date().toISOString() })
      .where(eq(suscripcionesOneclick.id, suscripcion.id));

    return { estado, buyOrder, monto };
  });

  // Fuera de la transacción/lock a propósito (avisar por WhatsApp no debe
  // retrasar la liberación del advisory lock). `buyOrder` es el id de la fila
  // en cobrosOneclick — sirve de origenId para no avisar dos veces por el
  // mismo intento de cobro (ver evaluarReglasPorCobroFallido). after() en vez
  // de un `.catch()` suelto: garantiza que Vercel mantenga la función viva
  // hasta que termine el envío, en vez de arriesgarse a que se congele a
  // medio camino y el disparo quede pegado en "programado" para siempre.
  const clienteId = suscripcion.clienteId;
  if (resultado.estado === "rechazada" && clienteId) {
    after(() =>
      evaluarReglasPorCobroFallido({
        clienteId,
        patente: suscripcion.patente,
        buyOrderId: resultado.buyOrder,
        monto: resultado.monto,
      }).catch((error) => console.error("Error evaluando reglas de WhatsApp por cobro fallido", suscripcion.id, error))
    );
    after(() =>
      evaluarReglasCorreoPorCobroFallido({
        clienteId,
        patente: suscripcion.patente,
        buyOrderId: resultado.buyOrder,
        monto: resultado.monto,
      }).catch((error) => console.error("Error evaluando reglas de correo por cobro fallido", suscripcion.id, error))
    );
  }

  return { estado: resultado.estado };
}
