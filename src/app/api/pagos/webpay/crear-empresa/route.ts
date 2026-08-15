import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pagosWebpay, pagosWebpayItems, precios } from "@/db/schema";
import { CANTIDAD_MAXIMA_TICKETS, CANTIDAD_MINIMA_TICKETS, formatRut, isValidEmail, isValidPatente, isValidRut, normPlate, precioTickets } from "@/lib/helpers";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { webpayTransaction } from "@/lib/transbank";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 10;
const VENTANA_MS = 5 * 60 * 1000;
const MAX_PATENTES = 100;
const MAX_LARGO_LOTE = 120;

type TipoDocumento = "Boleta" | "Factura";

interface BodyCrearEmpresa {
  cantidad?: number;
  tipoDocumento?: string;
  razonSocial?: string;
  rut?: string;
  direccion?: string;
  giro?: string;
  email?: string;
  nombreLote?: string;
  patentes?: string[];
}

function generarBuyOrder(): string {
  // "we" (web empresa) + timestamp en base36: siempre corto, cabe en el
  // límite de 26 caracteres que exige Transbank para buy_order — mismo
  // esquema que /api/pagos/webpay/crear, con otro prefijo para distinguir
  // en la base cuál endpoint originó la transacción.
  return "we" + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
}

export async function POST(request: NextRequest) {
  try {
    if (rateLimited(`pagos-crear-empresa:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    let body: BodyCrearEmpresa;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const cantidad = Math.round(Number(body.cantidad));
    if (!Number.isInteger(cantidad) || cantidad < CANTIDAD_MINIMA_TICKETS || cantidad > CANTIDAD_MAXIMA_TICKETS) {
      return NextResponse.json(
        { error: `Cantidad inválida, entre ${CANTIDAD_MINIMA_TICKETS} y ${CANTIDAD_MAXIMA_TICKETS} tickets` },
        { status: 400 }
      );
    }

    const tipoDocumento = body.tipoDocumento as TipoDocumento;
    if (tipoDocumento !== "Boleta" && tipoDocumento !== "Factura") {
      return NextResponse.json({ error: "Tipo de documento inválido" }, { status: 400 });
    }

    // Requerido siempre (Boleta y Factura): es lo que permite mostrarle sus
    // tickets al comprador en Mi Cuenta (portal cliente) más adelante, sin
    // depender del RUT (que hoy solo se pide para Factura).
    const email = (body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Ingresa un email válido" }, { status: 400 });
    }

    let razonSocial = "";
    let rut = "";
    let direccion = "";
    let giro = "";
    if (tipoDocumento === "Factura") {
      razonSocial = (body.razonSocial || "").trim();
      const rutCrudo = (body.rut || "").trim();
      if (!razonSocial || !rutCrudo) {
        return NextResponse.json({ error: "Completa Razón Social y RUT para la factura" }, { status: 400 });
      }
      if (!isValidRut(rutCrudo)) {
        return NextResponse.json({ error: "RUT inválido" }, { status: 400 });
      }
      rut = formatRut(rutCrudo);
      direccion = (body.direccion || "").trim();
      giro = (body.giro || "").trim();
    }

    // Opcional: el cliente le puede poner su propio nombre al lote (ej.
    // "Lavados rentacar SALFA Mayo") para reconocerlo después en Mi Cuenta y
    // en B2B/Tickets/Dsctos; si lo deja vacío, aplicarPagoPackEmpresa cae al
    // fallback de siempre (razonSocial o "Pack Empresa Web").
    const nombreLote = (body.nombreLote || "").trim().slice(0, MAX_LARGO_LOTE);

    const patentesCrudas = Array.isArray(body.patentes) ? body.patentes : [];
    if (patentesCrudas.length > MAX_PATENTES) {
      return NextResponse.json({ error: "Demasiadas patentes" }, { status: 400 });
    }
    const patentes: string[] = [];
    for (const p of patentesCrudas) {
      const normalizada = normPlate(typeof p === "string" ? p : "");
      if (!normalizada) continue;
      if (!isValidPatente(normalizada)) {
        return NextResponse.json({ error: `Patente inválida: ${p}` }, { status: 400 });
      }
      if (!patentes.includes(normalizada)) patentes.push(normalizada);
    }

    const db = getDb();
    const filasPrecios = await db.select().from(precios);
    const preciosMap = Object.fromEntries(filasPrecios.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));
    const monto = precioTickets(preciosMap, cantidad);
    if (!monto || monto <= 0) {
      return NextResponse.json({ error: "No se pudo calcular el monto a cobrar" }, { status: 500 });
    }

    const buyOrder = generarBuyOrder();
    const sessionId = "s" + Date.now();
    const returnUrl = new URL("/api/pagos/webpay/retorno", request.nextUrl.origin).toString();

    await db.insert(pagosWebpay).values({
      buyOrder,
      sessionId,
      // Sin auto asociado: mismo sentinel "" que ya usa Venta Empresa para
      // ventas sin patente/cliente (ver ventaToRow en @/lib/dataAccess).
      patente: "",
      tipo: "pack_empresa",
      monto,
      estado: "iniciada",
    });
    await db.insert(pagosWebpayItems).values({
      id: `${buyOrder}-0`,
      buyOrder,
      tipo: "pack_empresa",
      nombre: `${cantidad} Tickets`,
      monto,
      tipoDocumento,
      razonSocial: razonSocial || null,
      rut: rut || null,
      direccion: direccion || null,
      giro: giro || null,
      email,
      nombreLote: nombreLote || null,
      cantidadCupones: cantidad,
      patentesAutorizadas: patentes.length ? patentes : null,
    });

    const respuesta = await webpayTransaction().create(buyOrder, sessionId, monto, returnUrl);
    await db.update(pagosWebpay).set({ token: respuesta.token }).where(eq(pagosWebpay.buyOrder, buyOrder));
    return NextResponse.json({ url: respuesta.url, token: respuesta.token });
  } catch (error) {
    console.error("Error en /api/pagos/webpay/crear-empresa", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
