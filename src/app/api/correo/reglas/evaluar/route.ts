import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { procesarVencimientosCorreo } from "@/lib/mailing/reglas";

export const runtime = "nodejs";

// Disparado por el cron de Vercel (vercel.json) una vez al día, mismo patrón
// de auth que /api/whatsapp/reglas/evaluar (Vercel manda automáticamente
// "Authorization: Bearer $CRON_SECRET" cuando esa env var está configurada
// en el proyecto). Evalúa reglas "plan_proximo_vencer" y "plan_vencido" (ver
// @/lib/mailing/reglas/cron) — "venta_creada"/"cobro_fallido" ya se evalúan
// en vivo desde sus propios hooks (dataAccess/ventas.ts, cobrarSuscripcion),
// no necesitan este cron.
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

  const resultado = await procesarVencimientosCorreo();
  return NextResponse.json({ ok: true, ...resultado });
}
