import crypto from "crypto";
import { and, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, ventas } from "@/db/schema";
import { normPlate } from "@/lib/helpers";

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
// 3 días de ventana porque ningún ciclo real de renovación (un mes) debería
// generar dos pedidos "Renovación"/"Plan nuevo" tan seguidos para la misma
// patente.
const VENTANA_RENOVACION_SOSPECHOSA_MS = 3 * 24 * 60 * 60 * 1000;
const TIPOS_RENOVACION_WEB = ["Renovación (Web)", "Plan nuevo (Web)"];

/**
 * true si ya existe otra venta de renovación/plan-nuevo Web para este
 * cliente a menos de 3 días de `fechaOrden` — señal de que este pedido puede
 * ser un eco/duplicado de WooCommerce en vez de un ciclo nuevo real.
 */
export async function huboRenovacionWebReciente(clienteId: string, fechaOrden: string): Promise<boolean> {
  const centro = new Date(fechaOrden).getTime();
  const desde = new Date(centro - VENTANA_RENOVACION_SOSPECHOSA_MS).toISOString();
  const hasta = new Date(centro + VENTANA_RENOVACION_SOSPECHOSA_MS).toISOString();
  const [previa] = await getDb()
    .select({ id: ventas.id })
    .from(ventas)
    .where(and(eq(ventas.clienteId, clienteId), inArray(ventas.tipo, TIPOS_RENOVACION_WEB), gte(ventas.fecha, desde), lte(ventas.fecha, hasta)))
    .limit(1);
  return !!previa;
}
