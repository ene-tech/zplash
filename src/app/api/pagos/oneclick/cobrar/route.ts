import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { suscripcionesOneclick } from "@/db/schema";
import { cobrarSuscripcion } from "@/lib/pagos";

export const runtime = "nodejs";

// Disparado por el cron de Vercel (vercel.json) una vez al día. Vercel manda
// automáticamente "Authorization: Bearer $CRON_SECRET" en la llamada cuando
// esa env var está configurada en el proyecto.
function autorizacionValida(header: string | null, secreto: string): boolean {
  if (!header) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(header);
  return esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);
}

export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    console.error("CRON_SECRET no configurado");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }
  if (!autorizacionValida(request.headers.get("authorization"), secreto)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

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
