import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { procesarPendientesYVencimientos } from "@/lib/whatsapp/reglas";

export const runtime = "nodejs";
// "sin_visita" puede mandar cientos de SMS y correos en una corrida (ver
// PRESUPUESTO_MS_SIN_VISITA en @/lib/whatsapp/reglas/cron).
export const maxDuration = 300;

// Pese al nombre, también atiende las reglas con canal SMS y correo (ver ejecutarAccionRegla).

// Disparado por el cron de Vercel (vercel.json) una vez al día, mismo patrón
// de auth que /api/pagos/oneclick/cobrar. Procesa disparos "venta_creada" con
// delayDias > 0 ya vencidos y evalúa reglas "plan_proximo_vencer" contra
// clientes por vencer (ver @/lib/whatsapp/reglas). GET, no POST: el cron de
// Vercel invoca la ruta con GET y un POST-only devolvía 405 (mismo bug que
// tenía /api/pagos/oneclick/cobrar, ver el comentario ahí).
export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const resultado = await procesarPendientesYVencimientos();
  return NextResponse.json({ ok: true, ...resultado });
}
