import "server-only";

import { and, eq, gte, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { gastoAgenteWhatsapp, mensajesWhatsapp } from "@/db/schema";
import { ENVIADO_POR_AGENTE, uid } from "@/lib/helpers";

// enviadoPor de pruebas manuales hechas durante desarrollo (no vienen de
// ningún flujo real: ni reglas, ni mensajes masivos, ni respuesta manual de
// un agente desde el inbox) — se excluyen del conteo de gasto real.
// El agente con IA contesta dentro de la ventana de 24h que abrió el cliente:
// son mensajes de servicio, Meta no los cobra.
const ENVIADO_POR_DIAGNOSTICO = ["diagnostico-manual", "regla-whatsapp-test", ENVIADO_POR_AGENTE];

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

export async function registrarGastoAgenteWhatsapp(conversacionId: string, modelo: string, costoUsd: number): Promise<void> {
  await getDb().insert(gastoAgenteWhatsapp).values({ id: uid(), conversacionId, modelo, costoUsd });
}

// Suma de lo que costó el agente con IA entre desdeISO y hastaISO (ver
// gastoAgenteWhatsapp en @/db/schema/whatsapp).
export async function sumarGastoAgenteWhatsapp(desdeISO: string, hastaISO: string): Promise<{ usd: number; atenciones: number }> {
  const rows = await getDb()
    .select({ usd: sql<number>`coalesce(sum(${gastoAgenteWhatsapp.costoUsd}), 0)::float`, atenciones: sql<number>`count(*)::int` })
    .from(gastoAgenteWhatsapp)
    .where(and(gte(gastoAgenteWhatsapp.creadoEn, desdeISO), lte(gastoAgenteWhatsapp.creadoEn, hastaISO)));
  return rows[0] ?? { usd: 0, atenciones: 0 };
}
