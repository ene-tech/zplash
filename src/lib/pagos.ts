import "server-only";
import { TransactionDetail } from "transbank-sdk";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { clientes, cobrosOneclick, precios, suscripcionesOneclick, ventas } from "@/db/schema";
import { PLAN_ONECLICK_KEY, PLANES, mesActualKey, precioPlanOneclick, uid } from "@/lib/helpers";
import { oneclickChildCommerceCode, oneclickTransaction } from "@/lib/transbank";
import type { Precios } from "@/types";

function addDaysISO(iso: string, dias: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

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

interface AplicarPagoParams {
  patente: string;
  monto: number;
  ventaId: string;
  metodoPago: string;
  creadoPor: string;
  esServicioAdicional: boolean;
  // Si es servicio adicional no se toca plan/vencimiento del cliente; si no,
  // se extiende (o inicia) el ciclo de 30 días como cualquier renovación web.
  tipoVentaNuevo: string;
  tipoVentaExistente: string;
}

/**
 * Buscar/crear cliente por patente + insertar venta, para un pago que un
 * proveedor externo (Transbank) ya confirmó como aprobado. Compartido entre
 * webpay/retorno y los dos flujos de Oneclick — mismo patrón que ya usaba el
 * webhook de WooCommerce, factorizado acá porque ya son tres sitios
 * repitiendo la misma lógica.
 *
 * Recibe `db` (una conexión normal o una transacción/savepoint del llamador,
 * ver DbOrTx en @/db) en vez de abrir la suya propia: la extensión del
 * vencimiento del cliente y el insert de la venta son dos escrituras
 * separadas, así que si el llamador no las envuelve en una transacción, una
 * falla a mitad de camino puede dejar al cliente con el plan extendido sin
 * que exista la venta que lo respalda (y un reintento del mismo pago lo
 * extendería de nuevo, gratis). Los tres llamadores (webpay/retorno,
 * cobrarSuscripcion x2) ahora pasan su propia transacción.
 */
export async function aplicarPagoAprobado(p: AplicarPagoParams, db: DbOrTx = getDb()): Promise<{ clienteId: string }> {
  const [existente] = await db.select().from(clientes).where(eq(clientes.patente, p.patente)).limit(1);

  let clienteId: string;
  if (p.esServicioAdicional) {
    if (existente) {
      clienteId = existente.id;
    } else {
      clienteId = uid();
      await db.insert(clientes).values({
        id: clienteId,
        nombre: "Cliente Web",
        patente: p.patente,
        origen: "WEB",
        visitas: 0,
        creadoEn: new Date().toISOString(),
        creadoPor: p.creadoPor,
      });
    }
  } else if (existente) {
    const vencActual = existente.vencimiento ? new Date(existente.vencimiento) : null;
    const base = vencActual && vencActual > new Date() ? vencActual.toISOString() : new Date().toISOString();
    clienteId = existente.id;
    await db
      .update(clientes)
      .set({ vencimiento: addDaysISO(base, 30), plan: existente.plan || PLANES[0], origen: "WEB" })
      .where(eq(clientes.id, clienteId));
  } else {
    clienteId = uid();
    await db.insert(clientes).values({
      id: clienteId,
      nombre: "Cliente Web",
      patente: p.patente,
      plan: PLANES[0],
      vencimiento: addDaysISO(new Date().toISOString(), 30),
      fechaContratacion: new Date().toISOString(),
      origen: "WEB",
      visitas: 0,
      creadoEn: new Date().toISOString(),
      creadoPor: p.creadoPor,
    });
  }

  await db.insert(ventas).values({
    id: p.ventaId,
    clienteId,
    patente: p.patente,
    nombre: existente?.nombre || "Cliente Web",
    plan: p.esServicioAdicional ? "" : PLANES[0],
    precio: p.monto,
    tipo: existente ? p.tipoVentaExistente : p.tipoVentaNuevo,
    metodoPago: p.metodoPago,
    esServicioAdicional: p.esServicioAdicional,
    creadoPor: p.creadoPor,
  });

  return { clienteId };
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
  return getDb().transaction(async (tx) => {
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

    return { estado };
  });
}
