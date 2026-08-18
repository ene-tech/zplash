import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, precios } from "@/db/schema";
import { PLANES, isValidPatente, normPlate, planStatus, precioRenovacionCliente } from "@/lib/helpers";
import { getConfig } from "@/lib/dataAccess/config";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 30;
const VENTANA_MS = 5 * 60 * 1000;

// Endpoint público (sin sesión) para que un cliente consulte el estado de su
// plan antes de pagar en /pagar. Devuelve solo lo no sensible — nunca email,
// teléfono ni rut — porque cualquiera puede llamarlo con cualquier patente.
export async function GET(request: NextRequest) {
  try {
    if (rateLimited(`pagos-estado:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    const patente = normPlate(request.nextUrl.searchParams.get("patente"));
    if (!isValidPatente(patente)) {
      return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
    }

    const db = getDb();
    const [cliente] = await db.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
    if (!cliente) {
      return NextResponse.json({ encontrado: false });
    }
    const [{ diasGraciaPagoAtrasado }, filasPrecios] = await Promise.all([getConfig(), db.select().from(precios)]);
    const preciosMap = Object.fromEntries(filasPrecios.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));

    return NextResponse.json({
      encontrado: true,
      nombre: cliente.nombre,
      plan: cliente.plan,
      vencimiento: cliente.vencimiento,
      estado: planStatus(cliente),
      // Precio ya resuelto de renovar/pagar el plan de esta patente, con el
      // MISMO helper que cobra /api/pagos/webpay/crear (ver
      // precioRenovacionCliente): heredado si está en plazo, precio de siempre
      // si se atrasó pocos días, precio de lista si se pasó del plazo. Se
      // manda calculado y no en partes (precio de lista + heredado + días de
      // gracia, como estaba antes) justamente para que la pantalla no pueda
      // volver a anunciar un monto distinto del que termina cobrando Webpay.
      precioRenovacion: precioRenovacionCliente(preciosMap, cliente.plan || PLANES[0], cliente, diasGraciaPagoAtrasado),
      // Sigue yendo aparte porque /pagar lo usa para el precio de la
      // renovación automática (Oneclick), que no pasa por el plazo de atraso.
      precioPlanHeredado: cliente.precioPlanHeredado,
    });
  } catch (error) {
    console.error("Error en /api/pagos/estado", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
