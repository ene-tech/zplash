import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { procesarAvisosResenas } from "@/lib/resenas";

export const runtime = "nodejs";
export const maxDuration = 120;

// Cron de Vercel (vercel.json): borradores de respuesta a reseñas de Google,
// ver @/lib/resenas. GET porque el cron de Vercel invoca con GET.
export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  try {
    const resultado = await procesarAvisosResenas();
    return NextResponse.json({ ok: !resultado.errores.length, ...resultado });
  } catch (error) {
    console.error("Error procesando avisos de reseñas", error);
    return NextResponse.json({ ok: false, error: "No se pudo conectar al buzón" }, { status: 500 });
  }
}
