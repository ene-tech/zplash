import { NextRequest, NextResponse } from "next/server";
import { resolverLinkSms } from "@/lib/linkSms";
import { cobrarLavadoOneclick, ErrorCompraOneclick } from "@/lib/pagos";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const VENTANA_MS = 5 * 60 * 1000;
// Por conexión, holgado: en el celular muchos clientes salen a internet por la
// misma IP de la compañía (CGNAT), y justo después de un envío masivo tocan a
// la vez. Por link, corto: nadie necesita tocar más de unas pocas veces.
const LIMITE_POR_IP = 30;
const LIMITE_POR_LINK = 5;

// Pago de un toque desde el link personal de un SMS (/v/[codigo]): cobra el
// lavado contra la tarjeta Oneclick que la patente ya tiene guardada. Ruta
// pública a propósito: el código del SMS es la llave, y solo sirve para pagar
// el lavado de esa patente (ver @/lib/linkSms). Sin tarjeta guardada, la
// página va por /api/pagos/webpay/crear con el mismo código.
export async function POST(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  try {
    const codigo = (await params).codigo;
    if (
      (await rateLimited(`link-sms-pagar:${clienteIp(request)}`, LIMITE_POR_IP, VENTANA_MS)) ||
      (await rateLimited(`link-sms-pagar-link:${codigo.toUpperCase()}`, LIMITE_POR_LINK, VENTANA_MS))
    ) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }
    const link = await resolverLinkSms(codigo);
    if (!link) return NextResponse.json({ error: "Este link ya no está disponible" }, { status: 404 });

    try {
      const { estado } = await cobrarLavadoOneclick(link);
      return NextResponse.json({ ok: true, estado });
    } catch (error) {
      // Solo los mensajes pensados para el cliente; un error de la base o del
      // SDK de Transbank no se le muestra tal cual.
      if (error instanceof ErrorCompraOneclick) return NextResponse.json({ error: error.message }, { status: 400 });
      console.error("Error cobrando el lavado de un toque", link.codigo, error);
      return NextResponse.json({ error: "No se pudo cobrar la tarjeta. Intenta de nuevo en unos minutos o paga en el local." }, { status: 400 });
    }
  } catch (error) {
    console.error("Error en /api/v/[codigo]/pagar", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
