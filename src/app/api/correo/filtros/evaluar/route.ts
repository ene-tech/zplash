import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { aplicarFiltrosCorreo } from "@/lib/buzon/filtros";
import { listarReglasFiltroCorreo } from "@/lib/dataAccess";

export const runtime = "nodejs";

// Disparado por el cron de Vercel (vercel.json), mismo patrón de auth que
// /api/whatsapp/reglas/evaluar. Alternativa a Sieve real (ver comentario en
// @/db/schema/buzon) — si el proyecto está en el plan Hobby de Vercel, un
// cron con expresión más seguida que diaria puede quedar forzado a correr
// solo una vez al día; el botón "Aplicar ahora" del panel (ver
// aplicarFiltrosCorreoAhora) no depende de esto y corre al instante.
export async function POST(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const reglas = await listarReglasFiltroCorreo();
  const resultado = await aplicarFiltrosCorreo(reglas);
  return NextResponse.json({ ok: !resultado.error, ...resultado });
}
