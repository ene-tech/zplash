import "server-only";

import { and, eq, gte, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mensajesWhatsapp } from "@/db/schema";

// enviadoPor de pruebas manuales hechas durante desarrollo (no vienen de
// ningún flujo real: ni reglas, ni mensajes masivos, ni respuesta manual de
// un agente desde el inbox) — se excluyen del conteo de gasto real.
const ENVIADO_POR_DIAGNOSTICO = ["diagnostico-manual", "regla-whatsapp-test"];

// Cuenta mensajes salientes "generados por nosotros" (regla-whatsapp,
// mensajes-masivos, o un agente humano desde el inbox) entre desdeISO y
// hastaISO, para el resumen de gasto de WhatsApp (Web Settings → Historial
// WhatsApp). Excluye las respuestas automáticas del bot por menú
// (enviadoPor null, ver enviarMensajeTexto/Imagen sin ese parámetro en
// @/app/api/whatsapp/route.ts) y las pruebas de diagnóstico de desarrollo.
export async function contarMensajesWhatsappGenerados(desdeISO: string, hastaISO: string): Promise<number> {
  const rows = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(mensajesWhatsapp)
    .where(
      and(
        eq(mensajesWhatsapp.direccion, "saliente"),
        isNotNull(mensajesWhatsapp.enviadoPor),
        notInArray(mensajesWhatsapp.enviadoPor, ENVIADO_POR_DIAGNOSTICO),
        gte(mensajesWhatsapp.creadoEn, desdeISO),
        lte(mensajesWhatsapp.creadoEn, hastaISO)
      )
    );
  return rows[0]?.total ?? 0;
}
