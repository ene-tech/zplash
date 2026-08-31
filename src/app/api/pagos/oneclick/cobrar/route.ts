import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { and, asc, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { suscripcionesOneclick } from "@/db/schema";
import { cobrarSuscripcion } from "@/lib/pagos";

export const runtime = "nodejs";
// Cada suscripción es un viaje a Transbank en serie (~2-5s). Con el default
// de la plataforma, una tanda grande se corta a la mitad y las suscripciones
// que quedaron al final de la lista no se cobran nunca — el cron vuelve a
// armar la misma lista al día siguiente y las vuelve a dejar fuera.
export const maxDuration = 300;

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
    .where(and(eq(suscripcionesOneclick.estado, "activa"), lte(suscripcionesOneclick.proximoCobro, ahora)))
    // Deuda más vieja primero: si la tanda se corta, que lo que quede sin
    // cobrar sea lo recién vencido y no lo que lleva semanas esperando.
    .orderBy(asc(suscripcionesOneclick.proximoCobro));

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
