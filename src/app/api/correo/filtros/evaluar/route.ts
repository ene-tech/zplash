import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { aplicarFiltrosCorreo } from "@/lib/buzon/filtros";
import { listarReglasFiltroCorreo } from "@/lib/dataAccess";

export const runtime = "nodejs";

// Disparado por el cron de Vercel (vercel.json), mismo patrón de auth que
// /api/whatsapp/reglas/evaluar. Alternativa a Sieve real (ver comentario en
// @/db/schema/buzon) — si el proyecto está en el plan Hobby de Vercel, un
// cron con expresión más seguida que diaria puede quedar forzado a correr
// solo una vez al día; el botón "Aplicar ahora" del panel (ver
// aplicarFiltrosCorreoAhora) no depende de esto y corre al instante.
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

  const reglas = await listarReglasFiltroCorreo();
  const resultado = await aplicarFiltrosCorreo(reglas);
  return NextResponse.json({ ok: !resultado.error, ...resultado });
}
