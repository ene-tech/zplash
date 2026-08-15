import "server-only";
import { TransactionDetail } from "transbank-sdk";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cobrosOneclick, suscripcionesOneclick } from "@/db/schema";
import { mesActualKey } from "@/lib/helpers";
import { getConfig } from "@/lib/dataAccess/config";
import { oneclickChildCommerceCode, oneclickTransaction } from "@/lib/transbank";
import { aplicarPagoAprobado } from "./aplicarPagoAprobado";
import { aplicarUpgradePlan } from "./aplicarUpgradePlan";
import { proximoCicloISO } from "./cobrarSuscripcion";

export type TipoOfertaCuenta = "renovacion_temprana" | "reactivacion" | "upgrade_plan";

// Mismo criterio de nombres que TIPO_VENTA_PROMO_CUENTA en
// /api/pagos/webpay/retorno, pero marcado "(Oneclick)" en vez de "(Web)"
// para distinguir en el historial que este cobro no pasó por Webpay Plus.
// "upgrade_plan" no entra acá: tiene su propio label vía aplicarUpgradePlan.
const TIPO_VENTA_ONECLICK: Record<"renovacion_temprana" | "reactivacion", string> = {
  renovacion_temprana: "Renovación anticipada (Oneclick)",
  reactivacion: "Reactivación promocional (Oneclick)",
};

/**
 * Cobra una de las 3 promociones de plan de Mi Cuenta (ver
 * @/lib/helpers/ofertasPlan) directo contra la tarjeta que esa patente ya
 * tiene inscrita en Oneclick, sin redirigir a Webpay Plus — mismo mecanismo
 * de cobro que cobrarSuscripcion() (el cron mensual: oneclickTransaction().
 * authorize() contra tbkUser/username), pero con el monto de la promo en vez
 * del precio fijo del plan, y sin acoplarse al concepto de "ciclo" mensual:
 * agenda `proximoCobro` justo en el vencimiento real que dejó la promo
 * (aplicarPagoAprobado/aplicarUpgradePlan), no en "hoy + 30 días", para que
 * el cron de mañana no vuelva a cobrar la tarjeta mientras el cliente
 * todavía tenga días ya pagados por este cobro manual.
 *
 * El llamador (POST /api/cliente/mi-cuenta/cobrar-oferta) es responsable de
 * recalcular `monto` con datos frescos (calcularOfertasPlanDeCliente) antes
 * de invocar esto — igual que /api/pagos/webpay/crear, nunca se confía en un
 * monto que venga del cliente.
 */
export async function cobrarOfertaOneclick(patente: string, tipo: TipoOfertaCuenta, monto: number): Promise<{ estado: "aprobada" | "rechazada" }> {
  const db = getDb();
  const [suscripcion] = await db.select().from(suscripcionesOneclick).where(eq(suscripcionesOneclick.patente, patente)).limit(1);
  if (!suscripcion || suscripcion.estado !== "activa" || !suscripcion.tbkUser) {
    throw new Error("Esta patente no tiene una tarjeta registrada activa");
  }
  const tbkUser = suscripcion.tbkUser;

  const resultado = await db.transaction(async (tx) => {
    // Mismo advisory lock por suscripción que cobrarSuscripcion(): sin esto,
    // un doble click o un reintento de red podían pasar el chequeo de abajo
    // antes de que el primer intento terminara de escribir su resultado, y
    // cobrar dos veces la misma tarjeta.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${suscripcion.id}))`);

    const cicloYm = mesActualKey();
    // No hay un "ciclo" real acá (es un cobro puntual, no la mensualidad fija),
    // pero igual sirve de resguardo: si ya hay un cobro aprobado este mes para
    // esta tarjeta, no cobrar de nuevo.
    const [yaAprobado] = await tx
      .select({ id: cobrosOneclick.id })
      .from(cobrosOneclick)
      .where(and(eq(cobrosOneclick.suscripcionId, suscripcion.id), eq(cobrosOneclick.cicloYm, cicloYm), eq(cobrosOneclick.estado, "aprobada")))
      .limit(1);
    if (yaAprobado) {
      throw new Error("Ya se registró un cobro aprobado este mes con esta tarjeta");
    }

    const buyOrder = "oc" + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
    const commerceCode = oneclickChildCommerceCode();

    await tx.insert(cobrosOneclick).values({ id: buyOrder, suscripcionId: suscripcion.id, cicloYm, monto, estado: "rechazada" });

    let estado: "aprobada" | "rechazada" = "rechazada";
    let responseCode: number | null = null;
    let authorizationCode: string | null = null;
    let ventaId: string | null = null;
    // Vencimiento real que dejó aplicarUpgradePlan/aplicarPagoAprobado — se
    // usa para agendar `proximoCobro` (ver más abajo) en vez de un "hoy + 30
    // días" a ciegas, que desincroniza el cron de cobros automáticos cuando
    // el vencimiento nuevo queda más lejos que eso (ej. renovación anticipada
    // apilada sobre un plan que todavía tenía días vigentes).
    let vencimientoResultante: string | null = null;

    try {
      const resultadoTbk = await oneclickTransaction().authorize(suscripcion.username, tbkUser, buyOrder, [
        new TransactionDetail(monto, commerceCode, buyOrder),
      ]);
      const detalle = resultadoTbk.details?.[0];
      responseCode = detalle?.response_code ?? null;
      authorizationCode = detalle?.authorization_code || null;

      if (detalle?.response_code === 0) {
        estado = "aprobada";
        ventaId = "oc-" + buyOrder;
        try {
          // Savepoint aparte: si esto falla, Transbank ya cobró la tarjeta, así
          // que NO puede perderse el registro de que el cobro quedó "aprobada"
          // — solo se revierte la extensión de vencimiento/venta a medio
          // aplicar, y ventaId queda en null para revisión manual.
          await tx.transaction(async (tx2) => {
            if (tipo === "upgrade_plan") {
              const config = await getConfig();
              const r = await aplicarUpgradePlan(
                {
                  patente,
                  monto,
                  ventaId: ventaId as string,
                  metodoPago: "tarjeta",
                  creadoPor: "Cliente (Oneclick)",
                  horasVentanaUpgrade: config.horasVentanaUpgradePlan,
                  tipoVenta: "Upgrade a Plan Ilimitado (Oneclick)",
                },
                tx2
              );
              vencimientoResultante = r.vencimiento;
            } else {
              const r = await aplicarPagoAprobado(
                {
                  patente,
                  monto,
                  ventaId: ventaId as string,
                  metodoPago: "tarjeta",
                  creadoPor: "Cliente (Oneclick)",
                  esServicioAdicional: false,
                  tipoVentaNuevo: TIPO_VENTA_ONECLICK[tipo],
                  tipoVentaExistente: TIPO_VENTA_ONECLICK[tipo],
                },
                tx2
              );
              vencimientoResultante = r.vencimiento;
            }
          });
        } catch (errorAplicar) {
          console.error(
            "Pago Oneclick (oferta Mi Cuenta) aprobado por Transbank pero no se pudo aplicar en la base — requiere revisión manual",
            suscripcion.id,
            buyOrder,
            errorAplicar
          );
          ventaId = null;
        }
      }
    } catch (error) {
      console.error("Error autorizando cobro Oneclick de oferta Mi Cuenta", suscripcion.id, error);
      estado = "rechazada";
    }

    await tx.update(cobrosOneclick).set({ estado, responseCode, authorizationCode, ventaId }).where(eq(cobrosOneclick.id, buyOrder));

    if (estado === "aprobada") {
      // Agenda el próximo cobro automático justo en el vencimiento real que
      // quedó tras aplicar este pago (mismo principio que documenta
      // /api/pagos/oneclick/inscripcion/retorno: "nunca antes, para no
      // duplicar lo que el cliente ya pagó por otro medio"). Antes usaba
      // proximoCicloISO(null) ("hoy + 30 días" fijo): para una renovación
      // anticipada el nuevo vencimiento se apila sobre el que ya tenía
      // vigente (puede quedar a más de 30 días de hoy), así que agendar el
      // próximo cobro a 30 días fijos lo dejaba ANTES de esa fecha — el cron
      // diario volvía a cobrar la tarjeta mientras el cliente todavía tenía
      // días ya pagados, un doble cobro real. vencimientoResultante siempre
      // queda seteado acá (las 3 promociones de esta función extienden
      // plan/vencimiento) — proximoCicloISO(null) queda solo de resguardo
      // defensivo por si algún día eso deja de ser cierto.
      await tx
        .update(suscripcionesOneclick)
        .set({ proximoCobro: vencimientoResultante ?? proximoCicloISO(null), actualizadoEn: new Date().toISOString() })
        .where(eq(suscripcionesOneclick.id, suscripcion.id));
    }

    return { estado };
  });

  return resultado;
}
