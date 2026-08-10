import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pagosWebpay, pagosWebpayItems, precios, servicios } from "@/db/schema";
import {
  PLANES,
  isValidPatente,
  normPlate,
  precioLavadoUnicoWeb,
  precioNormal,
  precioServicio,
  precioZonaAspirado,
} from "@/lib/helpers";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { webpayTransaction } from "@/lib/transbank";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 10;
const VENTANA_MS = 5 * 60 * 1000;
const MAX_ITEMS = 20;

type TipoPago = "plan_nuevo" | "renovacion" | "servicio" | "lavado_unico" | "aspirado";
const TIPOS_VALIDOS = new Set<TipoPago>(["plan_nuevo", "renovacion", "servicio", "lavado_unico", "aspirado"]);
const TIPOS_PLAN = new Set<TipoPago>(["plan_nuevo", "renovacion"]);

function generarBuyOrder(): string {
  // "wp" + timestamp en base36: siempre corto, cabe en el límite de 26
  // caracteres que exige Transbank para buy_order.
  return "wp" + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
}

interface ItemResuelto {
  tipo: TipoPago;
  servicioId: string | null;
  nombre: string;
  monto: number;
}

export async function POST(request: NextRequest) {
  try {
    if (rateLimited(`pagos-crear:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    let body: { patente?: string; items?: { tipo?: string; servicioId?: string }[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const patente = normPlate(body.patente);
    if (!isValidPatente(patente)) {
      return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
    }

    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
      return NextResponse.json({ error: "Carrito inválido" }, { status: 400 });
    }

    for (const item of body.items) {
      if (!TIPOS_VALIDOS.has(item.tipo as TipoPago)) {
        return NextResponse.json({ error: "Tipo de pago inválido" }, { status: 400 });
      }
    }
    const cantidadPlanes = body.items.filter((i) => TIPOS_PLAN.has(i.tipo as TipoPago)).length;
    if (cantidadPlanes > 1) {
      return NextResponse.json({ error: "Solo se puede pagar un plan por transacción" }, { status: 400 });
    }

    const db = getDb();
    const filasPrecios = await db.select().from(precios);
    const preciosMap = Object.fromEntries(filasPrecios.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));

    const items: ItemResuelto[] = [];
    for (const item of body.items) {
      const tipo = item.tipo as TipoPago;
      if (tipo === "servicio") {
        const [servicio] = await db.select().from(servicios).where(eq(servicios.id, item.servicioId ?? "")).limit(1);
        if (!servicio || !servicio.activo) {
          return NextResponse.json({ error: "Servicio no encontrado" }, { status: 400 });
        }
        items.push({ tipo, servicioId: servicio.id, nombre: servicio.nombre, monto: precioServicio(preciosMap, servicio.id) });
      } else if (tipo === "lavado_unico") {
        items.push({ tipo, servicioId: null, nombre: "Lavado único", monto: precioLavadoUnicoWeb(preciosMap) });
      } else if (tipo === "aspirado") {
        items.push({
          tipo,
          servicioId: null,
          nombre: "Uso Zona Aspirado Autoservicio",
          monto: precioZonaAspirado(preciosMap),
        });
      } else {
        items.push({ tipo, servicioId: null, nombre: "Plan Ilimitado Mensual", monto: precioNormal(preciosMap, PLANES[0]) });
      }
    }

    const montoTotal = items.reduce((sum, i) => sum + i.monto, 0);
    if (!montoTotal || montoTotal <= 0) {
      return NextResponse.json({ error: "No se pudo calcular el monto a cobrar" }, { status: 500 });
    }

    const buyOrder = generarBuyOrder();
    const sessionId = "s" + Date.now();
    const returnUrl = new URL("/api/pagos/webpay/retorno", request.nextUrl.origin).toString();

    await db.insert(pagosWebpay).values({
      buyOrder,
      sessionId,
      patente,
      tipo: items.length === 1 ? items[0].tipo : "carrito",
      servicioId: items.length === 1 ? items[0].servicioId : null,
      monto: montoTotal,
      estado: "iniciada",
    });
    await db.insert(pagosWebpayItems).values(
      items.map((item, i) => ({
        id: `${buyOrder}-${i}`,
        buyOrder,
        tipo: item.tipo,
        servicioId: item.servicioId,
        nombre: item.nombre,
        monto: item.monto,
      }))
    );

    const respuesta = await webpayTransaction().create(buyOrder, sessionId, montoTotal, returnUrl);
    await db.update(pagosWebpay).set({ token: respuesta.token }).where(eq(pagosWebpay.buyOrder, buyOrder));
    return NextResponse.json({ url: respuesta.url, token: respuesta.token });
  } catch (error) {
    console.error("Error en /api/pagos/webpay/crear", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
