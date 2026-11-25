import { NextRequest, NextResponse } from "next/server";
import { canjearLinkInstagram } from "@/lib/instagram/cuponSeguidor";
import { origenValido } from "@/lib/csrf";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Activación del descuento de Instagram desde /ig/[codigo]: patente, datos que
// falten y código del correo (ver canjearLinkInstagram). Pública a propósito:
// el código del link es la llave.
export async function POST(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  if (!origenValido(request)) return NextResponse.json({ estado: "error", error: "Origen no permitido" }, { status: 403 });
  const codigo = (await params).codigo;
  if (
    (await rateLimited(`ig-canje:${clienteIp(request)}`, 30, 10 * 60 * 1000)) ||
    (await rateLimited(`ig-canje-link:${codigo.toUpperCase()}`, 20, 10 * 60 * 1000))
  ) {
    return NextResponse.json({ estado: "error", error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ estado: "error", error: "JSON inválido" }, { status: 400 });
  }
  const texto = (v: unknown) => (typeof v === "string" ? v : undefined);

  try {
    const resultado = await canjearLinkInstagram(codigo, {
      patente: texto(body.patente) || "",
      nombre: texto(body.nombre),
      telefono: texto(body.telefono),
      email: texto(body.email),
      solicitudId: texto(body.solicitudId),
      codigoVerificacion: texto(body.codigoVerificacion),
    });
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Error activando descuento de Instagram", codigo, error);
    return NextResponse.json({ estado: "error", error: "Error de servidor, intenta de nuevo" }, { status: 500 });
  }
}
