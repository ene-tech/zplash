import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { procesarDisparosProgramados, procesarInscripcionesPendientes } from "@/lib/whatsapp/reglas";

export const runtime = "nodejs";

// Pese al nombre, también atiende las reglas con canal SMS y correo (ver ejecutarAccionRegla).

// Cron de cada 15 min (vercel.json): manda los disparos de reglas con espera
// corta (delayMinutos, ej. el regalo para otro auto una hora después del
// lavado). El barrido diario (/api/whatsapp/reglas/evaluar) hace además todo
// lo demás; este solo los programados, que es una consulta liviana.
export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const resultado = await procesarDisparosProgramados();
  // Inscripciones de tarjeta a medias: el aviso de 1 hora necesita este cron
  // y no el diario.
  const inscripciones = await procesarInscripcionesPendientes();
  return NextResponse.json({
    ok: true,
    procesados: resultado.procesados + inscripciones.procesados,
    errores: resultado.errores + inscripciones.errores,
  });
}
