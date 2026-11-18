import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, suscripcionesOneclick } from "@/db/schema";
import { insertAuditoria } from "@/lib/dataAccess/auditoria";
import { cancelarSuscripcionOneclick } from "@/lib/dataAccess/oneclick";
import { ESTADOS_TARJETA_VIVA, sigueVigenteHoy } from "@/lib/helpers";

export const ACTOR_BAJA_COBRO_FALLIDO = "Automático (cobro fallido 21 días)";

/**
 * Fin de la racha de reintentos del cron (10 intentos en 21 días, ver
 * DIAS_REINTENTO) sin que la tarjeta pague: el cliente queda "Sin plan", con
 * los mismos campos que limpia "Eliminar Plan" de Mi Cuenta (fechaContratacion
 * incluida: si vuelve, contrata un mes completo y no el resto del ciclo viejo),
 * y se cancelan sus suscripciones Oneclick vivas —la tarjeta se borra en
 * Transbank, igual que Cancelar desde la ficha—. Todas y no solo la cortada: una
 * hermana viva le seguiría cobrando un plan que ya no tiene. La ficha, sus
 * ventas y su historial siguen.
 *
 * Decisión del usuario (18-nov-2026). Solo el corte del día 21: -11, -10 y
 * "Transbank no contestó" siguen cortando sin cancelar.
 *
 * No se toca nada si:
 *  - no hay ficha (`clienteId` null): sin poder mirar la vigencia no se borra
 *    una tarjeta;
 *  - el plan quedó vigente (pagó por el link o en el mesón): el cron la reagenda;
 *  - renueva por WooCommerce: WordPress le podría seguir cobrando con la ficha
 *    "Sin plan" (mismo resguardo que eliminar-plan);
 *  - el vencimiento cambió entre la lectura y la escritura (un pago que entró
 *    justo ahora): el update es condicional y, si no pisa nada, no se cancela.
 */
export async function darDeBajaPorCobroFallido(clienteId: string | null, patente: string): Promise<void> {
  if (!clienteId) return;
  const db = getDb();
  const [cliente] = await db
    .select({
      id: clientes.id,
      plan: clientes.plan,
      vencimiento: clientes.vencimiento,
      fechaContratacion: clientes.fechaContratacion,
      precioPlanHeredado: clientes.precioPlanHeredado,
      renovacionAutoWooDesde: clientes.renovacionAutoWooDesde,
    })
    .from(clientes)
    .where(eq(clientes.id, clienteId))
    .limit(1);
  if (!cliente || sigueVigenteHoy(cliente.vencimiento) || cliente.renovacionAutoWooDesde) return;

  if (cliente.plan || cliente.vencimiento) {
    const sinPlan = { plan: null, vencimiento: null, fechaContratacion: null, precioPlanHeredado: null };
    const pisadas = await db
      .update(clientes)
      .set(sinPlan)
      .where(and(eq(clientes.id, cliente.id), cliente.vencimiento ? eq(clientes.vencimiento, cliente.vencimiento) : isNull(clientes.vencimiento)))
      .returning({ id: clientes.id });
    if (!pisadas.length) return;
    await insertAuditoria([
      {
        tabla: "clientes",
        registroId: cliente.id,
        accion: "update",
        datosAnteriores: {
          plan: cliente.plan,
          vencimiento: cliente.vencimiento,
          fechaContratacion: cliente.fechaContratacion,
          precioPlanHeredado: cliente.precioPlanHeredado,
        },
        datosNuevos: { ...sinPlan, motivo: "Cobro automático fallido 21 días" },
        usuario: ACTOR_BAJA_COBRO_FALLIDO,
      },
    ]);
  }

  const vivas = await db
    .select({ id: suscripcionesOneclick.id })
    .from(suscripcionesOneclick)
    .where(and(eq(suscripcionesOneclick.patente, patente), inArray(suscripcionesOneclick.estado, ESTADOS_TARJETA_VIVA)));
  for (const s of vivas) await cancelarSuscripcionOneclick(s.id, ACTOR_BAJA_COBRO_FALLIDO);
}
