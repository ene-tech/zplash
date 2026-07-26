import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { procesarPendientesYVencimientos } from "@/lib/whatsapp/reglas";

export const runtime = "nodejs";

// Disparado por el cron de Vercel (vercel.json) una vez al día, mismo patrón
// de auth que /api/pagos/oneclick/cobrar. Procesa disparos "venta_creada" con
// delayDias > 0 ya vencidos y evalúa reglas "plan_proximo_vencer" contra
// clientes por vencer (ver @/lib/whatsapp/reglas).
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

  const resultado = await procesarPendientesYVencimientos();
  return NextResponse.json({ ok: true, ...resultado });
}
