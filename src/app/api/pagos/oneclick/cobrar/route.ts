import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { suscripcionesOneclick } from "@/db/schema";
import { cobrarSuscripcion } from "@/lib/pagos";

export const runtime = "nodejs";

// Disparado por el cron de Vercel (vercel.json) una vez al día. Vercel manda
// automáticamente "Authorization: Bearer $CRON_SECRET" en la llamada cuando
// esa env var está configurada en el proyecto.
//
// GET, no POST: el cron de Vercel siempre invoca la ruta con GET. Mientras
// esto exportaba solo POST, la llamada diaria recibía 405 y ningún cobro
// automático se ejecutaba nunca — los únicos cobros que había eran los del
// primer cargo al inscribir la tarjeta (ago-2026: 10 suscripciones activas
// con proximoCobro vencido y cero filas en cobros_oneclick).
export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const db = getDb();
  const ahora = new Date().toISOString();
  const suscripciones = await db
    .select()
    .from(suscripcionesOneclick)
    .where(and(eq(suscripcionesOneclick.estado, "activa"), lte(suscripcionesOneclick.proximoCobro, ahora)));

  const resultados: { suscripcionId: string; patente: string; estado?: string; error?: string }[] = [];
  for (const suscripcion of suscripciones) {
    try {
      const { estado } = await cobrarSuscripcion(suscripcion);
      resultados.push({ suscripcionId: suscripcion.id, patente: suscripcion.patente, estado });
    } catch (error) {
      console.error("Error cobrando suscripción Oneclick", suscripcion.id, error);
      resultados.push({ suscripcionId: suscripcion.id, patente: suscripcion.patente, error: "error" });
    }
  }

  return NextResponse.json({ ok: true, procesadas: resultados.length, resultados });
}
