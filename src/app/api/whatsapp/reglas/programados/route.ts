import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { procesarDisparosProgramados } from "@/lib/whatsapp/reglas";

export const runtime = "nodejs";

// Cron de cada 15 min (vercel.json): manda los disparos de reglas con espera
// corta (delayMinutos, ej. el regalo para otro auto una hora después del
// lavado). El barrido diario (/api/whatsapp/reglas/evaluar) hace además todo
// lo demás; este solo los programados, que es una consulta liviana.
export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const resultado = await procesarDisparosProgramados();
  return NextResponse.json({ ok: true, ...resultado });
}
