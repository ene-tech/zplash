import crypto from "crypto";
import { eq, ilike } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
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

export function addDaysISO(iso: string, dias: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
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
