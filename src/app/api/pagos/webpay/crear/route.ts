import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pagosWebpay, precios, servicios } from "@/db/schema";
import { PLANES, isValidPatente, normPlate, precioNormal, precioServicio } from "@/lib/helpers";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { webpayTransaction } from "@/lib/transbank";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 10;
const VENTANA_MS = 5 * 60 * 1000;

type TipoPago = "plan_nuevo" | "renovacion" | "servicio";
const TIPOS_VALIDOS = new Set<TipoPago>(["plan_nuevo", "renovacion", "servicio"]);

function generarBuyOrder(): string {
  // "wp" + timestamp en base36: siempre corto, cabe en el límite de 26
  // caracteres que exige Transbank para buy_order.
  return "wp" + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
}

export async function POST(request: NextRequest) {
  try {
    if (rateLimited(`pagos-crear:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    let body: { patente?: string; tipo?: string; servicioId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const patente = normPlate(body.patente);
    if (!isValidPatente(patente)) {
      return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
    }

    const tipo = body.tipo as TipoPago;
    if (!TIPOS_VALIDOS.has(tipo)) {
      return NextResponse.json({ error: "Tipo de pago inválido" }, { status: 400 });
    }

    const db = getDb();
    const filasPrecios = await db.select().from(precios);
    const preciosMap = Object.fromEntries(filasPrecios.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));

    let monto: number;
    let servicioId: string | null = null;
    if (tipo === "servicio") {
      const [servicio] = await db.select().from(servicios).where(eq(servicios.id, body.servicioId ?? "")).limit(1);
      if (!servicio || !servicio.activo) {
        return NextResponse.json({ error: "Servicio no encontrado" }, { status: 400 });
      }
      servicioId = servicio.id;
      monto = precioServicio(preciosMap, servicio.id);
    } else {
      monto = precioNormal(preciosMap, PLANES[0]);
    }

    if (!monto || monto <= 0) {
      return NextResponse.json({ error: "No se pudo calcular el monto a cobrar" }, { status: 500 });
    }

    const buyOrder = generarBuyOrder();
    const sessionId = "s" + Date.now();
    const returnUrl = new URL("/api/pagos/webpay/retorno", request.nextUrl.origin).toString();

    await db.insert(pagosWebpay).values({
      buyOrder,
      sessionId,
      patente,
      tipo,
      servicioId,
      monto,
      estado: "iniciada",
    });

    const respuesta = await webpayTransaction().create(buyOrder, sessionId, monto, returnUrl);
    await db.update(pagosWebpay).set({ token: respuesta.token }).where(eq(pagosWebpay.buyOrder, buyOrder));
    return NextResponse.json({ url: respuesta.url, token: respuesta.token });
  } catch (error) {
    console.error("Error en /api/pagos/webpay/crear", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
