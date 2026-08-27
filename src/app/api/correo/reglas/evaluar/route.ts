import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { procesarVencimientosCorreo } from "@/lib/mailing/reglas";

export const runtime = "nodejs";

// Disparado por el cron de Vercel (vercel.json) una vez al día, mismo patrón
// de auth que /api/whatsapp/reglas/evaluar (Vercel manda automáticamente
// "Authorization: Bearer $CRON_SECRET" cuando esa env var está configurada
// en el proyecto). Evalúa reglas "plan_proximo_vencer" y "plan_vencido" (ver
// @/lib/mailing/reglas/cron) — "venta_creada"/"cobro_fallido" ya se evalúan
// en vivo desde sus propios hooks (dataAccess/ventas.ts, cobrarSuscripcion),
// no necesitan este cron.
export async function POST(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const resultado = await procesarVencimientosCorreo();
  return NextResponse.json({ ok: true, ...resultado });
}
