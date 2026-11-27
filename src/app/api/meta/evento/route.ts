import { NextRequest, NextResponse } from "next/server";
import { enviarEventoMeta } from "@/lib/metaCapi";
import { montoCompraAprobada } from "@/lib/pagos/montoAprobado";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Copia de servidor (Conversions API) de los eventos del pixel de Meta. La
// llama @/lib/metaPixel con sendBeacon, y solo si el pixel está cargado: sin
// consentimiento de cookies no llega nada acá. Pública a propósito; lo único
// que se puede hacer con ella es mandar un evento al pixel, y el Purchase solo
// sale si el buyOrder es una compra aprobada (el monto se lee de la base).
export async function POST(request: NextRequest) {
  try {
    if (await rateLimited(`meta-evento:${clienteIp(request)}`, 30, 5 * 60 * 1000)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
    const body = await request.json().catch(() => null);
    const nombre = body?.evento;
    const eventId = typeof body?.eventId === "string" ? body.eventId.slice(0, 64) : "";
    const url = typeof body?.url === "string" && /^https:\/\/(www\.)?zplash\.cl(\/|$)/.test(body.url) ? body.url.slice(0, 500) : "";
    if ((nombre !== "Purchase" && nombre !== "InitiateCheckout") || !eventId || !url) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    let valor: number | undefined;
    if (nombre === "Purchase") {
      const monto = await montoCompraAprobada(eventId);
      if (monto === null) return NextResponse.json({ ok: false }, { status: 404 });
      valor = monto;
    }

    await enviarEventoMeta({
      nombre,
      eventId,
      url,
      valor,
      ip: clienteIp(request),
      userAgent: request.headers.get("user-agent") || "",
      fbp: request.cookies.get("_fbp")?.value,
      fbc: request.cookies.get("_fbc")?.value,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error mandando evento a la Conversions API de Meta", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
