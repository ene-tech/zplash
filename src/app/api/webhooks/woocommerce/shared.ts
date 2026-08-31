import crypto from "crypto";
import { and, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, ventas } from "@/db/schema";
import { TIPOS_VENTA_PLAN, normPlate } from "@/lib/helpers";

// Compartido entre los dos endpoints de WooCommerce (pedidos y suscripción):
// ambos verifican la misma firma HMAC y extraen la patente/email del mismo
// tipo de payload (Order y Subscription son el mismo objeto base en la REST
// API de WooCommerce, ambos con billing/meta_data).

export function verificarFirma(rawBody: string, firma: string | null, secreto: string): boolean {
  if (!firma) return false;
  const esperada = crypto.createHmac("sha256", secreto).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(esperada);
  const b = Buffer.from(firma);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Los formularios de checkout que agregan un campo "Patente" lo guardan como
// meta_data suelto o como una clave extra dentro de billing; buscamos por
// nombre de clave en vez de asumir una ubicación fija.
export function extraerPatente(payload: Record<string, unknown>): string {
  const candidatos: string[] = [];
  const billing = payload.billing as Record<string, unknown> | undefined;
  if (billing) {
    for (const [k, v] of Object.entries(billing)) {
      if (typeof v === "string" && /patente/i.test(k)) candidatos.push(v);
    }
  }
  const metaData = payload.meta_data as Array<{ key?: string; value?: unknown }> | undefined;
  if (Array.isArray(metaData)) {
    for (const m of metaData) {
      if (m && typeof m.key === "string" && /patente/i.test(m.key) && typeof m.value === "string") {
        candidatos.push(m.value);
      }
    }
  }
  return normPlate(candidatos.find((c) => c && c.trim()) || "");
}

/** Mismo criterio de búsqueda que ya usaba el webhook de pedidos: por patente primero, por email si no hay match. */
export async function buscarClienteExistente(patente: string, email: string): Promise<typeof clientes.$inferSelect | undefined> {
  const db = getDb();
  if (patente) {
    const [porPatente] = await db.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
    if (porPatente) return porPatente;
  }
  if (email) {
    const [porEmail] = await db.select().from(clientes).where(ilike(clientes.email, email)).limit(1);
    if (porEmail) return porEmail;
  }
  return undefined;
}

// Visto en producción (ago-2026): WooCommerce Subscriptions generó más de un
// pedido de renovación con IDs distintos para el mismo ciclo de un mismo
// cliente, separados por minutos u horas — cada uno pasa la firma HMAC y
// tiene un orderId legítimo, así que el chequeo de "mismo orderId ya
// procesado" en route.ts no lo detecta, y cada uno apilaba un mes más de
// vencimiento sin que hubiera 2 pagos reales de por medio en todos los casos.
// 7 días de ventana: un ciclo real es de un mes, así que dos ventas de plan
// para la misma patente en la misma semana no son dos ciclos.
//
// Estuvo en 3 y se escapaban duplicados reales. Calibrado sobre los pares de
// ventas de plan consecutivas en producción (ago-2026, excluyendo la carga
// histórica de WooCommerce): hay un pico de 31 pares entre 0 y 4 días, sigue
// habiendo duplicados cruzados en 6 (LDLY46: "Renovación preferencial" del
// mesón y "Renovación (Web)" del webhook) y en 7 (KTRT11: webhook y Webpay
// nativo), y recién en 8-9 días los pares dejan de parecer ecos —ahí ya son
// una fila histórica sin canal seguida de una renovación real. El corte va
// justo en ese cambio.
const VENTANA_RENOVACION_SOSPECHOSA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * true si ya existe otra venta de PLAN para este cliente a menos de una
 * semana de `fechaOrden` — señal de que este pedido puede ser un eco de
 * WooCommerce (o el pedido que llega después de que el operador ya cobró en
 * el mesón) en vez de un ciclo nuevo real.
 *
 * Mira TIPOS_VENTA_PLAN, o sea CUALQUIER canal. Antes solo miraba
 * ["Renovación (Web)", "Plan nuevo (Web)"] —los tipos que escribe este mismo
 * webhook— así que un cobro registrado en el mesón le era invisible y el
 * pedido de WooCommerce apilaba un mes más encima: en agosto-2026 pasó con
 * TPJZ97, TZPY12, JFCF40, VRHY85 y PKFL78, todos con un "Plan nuevo" o
 * "Renovación Web (manual)" del mesón a 0-2 días.
 *
 * La lista vive en @/lib/helpers/ventas a propósito y no como copia local:
 * cada canal nuevo agrega su tipo allá, y una copia acá se queda atrás en
 * silencio — que es exactamente cómo se abrió este agujero.
 */
export async function huboRenovacionWebReciente(clienteId: string, fechaOrden: string): Promise<boolean> {
  const centro = new Date(fechaOrden).getTime();
  const desde = new Date(centro - VENTANA_RENOVACION_SOSPECHOSA_MS).toISOString();
  const hasta = new Date(centro + VENTANA_RENOVACION_SOSPECHOSA_MS).toISOString();
  const [previa] = await getDb()
    .select({ id: ventas.id })
    .from(ventas)
    .where(and(eq(ventas.clienteId, clienteId), inArray(ventas.tipo, [...TIPOS_VENTA_PLAN]), gte(ventas.fecha, desde), lte(ventas.fecha, hasta)))
    .limit(1);
  return !!previa;
}
