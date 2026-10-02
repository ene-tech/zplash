import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cupones } from "@/db/schema";
import { estadoCupon, formatRut, isValidRut } from "@/lib/helpers";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 20;
const VENTANA_MS = 5 * 60 * 1000;

// Público: la empresa consulta el estado de sus tickets (Pack de Tickets) sin
// depender del admin, por RUT (widget "Consulta tickets"). Había también una
// consulta por email que nadie llamaba y que, sin sesión, entregaba las
// patentes y fechas de uso de cualquier correo: se sacó. Solo expone lo necesario para el reporte (código, estado, patente/
// fecha de uso), nunca `valor` u otros datos internos del cupón.
export async function GET(request: NextRequest) {
  try {
    if (await rateLimited(`empresa-tickets:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    const rutCrudo = request.nextUrl.searchParams.get("rut") || "";
    if (!isValidRut(rutCrudo)) {
      return NextResponse.json({ error: rutCrudo ? "RUT inválido" : "Falta RUT" }, { status: 400 });
    }
    const condicion = eq(cupones.rut, formatRut(rutCrudo));

    const db = getDb();
    const filas = await db
      .select({
        codigo: cupones.codigo,
        nombreLote: cupones.nombreLote,
        numeroLote: cupones.numeroLote,
        totalLote: cupones.totalLote,
        usado: cupones.usado,
        fechaCaducidad: cupones.fechaCaducidad,
        patenteUso: cupones.patenteUso,
        fechaUso: cupones.fechaUso,
        creadoEn: cupones.creadoEn,
      })
      .from(cupones)
      .where(condicion);

    // El código sale enmascarado: este endpoint es público y se consulta por
    // RUT, que en Chile es enumerable, así que devolverlo entero era entregar
    // los tickets sin usar de cualquier empresa a quien probara RUTs (un
    // código de cupón es un lavado gratis, ver canjearCupon). Los 2 últimos
    // caracteres alcanzan para distinguir las filas en pantalla y no para
    // canjear nada; el código completo lo tiene quien compró (va en el correo
    // del Pack) y el mesón no lo necesita — reconoce el ticket por patente.
    const tickets = filas
      .map((f) => ({
        codigo: `••••${f.codigo.slice(-2)}`,
        nombreLote: f.nombreLote,
        numeroLote: f.numeroLote,
        totalLote: f.totalLote,
        estado: estadoCupon(f).label,
        patenteUso: f.patenteUso,
        fechaUso: f.fechaUso,
        creadoEn: f.creadoEn,
      }))
      .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());

    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("Error en /api/empresa/tickets", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
