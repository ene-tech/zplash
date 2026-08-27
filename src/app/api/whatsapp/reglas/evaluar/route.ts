import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { procesarPendientesYVencimientos } from "@/lib/whatsapp/reglas";

export const runtime = "nodejs";

// Disparado por el cron de Vercel (vercel.json) una vez al día, mismo patrón
// de auth que /api/pagos/oneclick/cobrar. Procesa disparos "venta_creada" con
// delayDias > 0 ya vencidos y evalúa reglas "plan_proximo_vencer" contra
// clientes por vencer (ver @/lib/whatsapp/reglas).
export async function POST(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const resultado = await procesarPendientesYVencimientos();
  return NextResponse.json({ ok: true, ...resultado });
}
