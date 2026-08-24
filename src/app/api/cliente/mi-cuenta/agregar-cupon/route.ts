import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cupones } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { normPlate } from "@/lib/helpers";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_IP = 15;
const VENTANA_MS = 10 * 60 * 1000;

// Suma a la cuenta un código que el cliente recibió por fuera: un ticket de un
// Pack Empresa o un cupón de descuento de una promo. NO lo canjea — consumirlo
// sigue siendo del operador (ver canjearCupon en useOperadorScanPanel) — solo
// lo ata a esta cuenta:
//   - guarda el email de la sesión, así el código queda listado en "Mis
//     tickets y cupones" (mismo GET /api/empresa/tickets que ya usa esa
//     sección) en vez de vivir solo en un papel o un correo suelto;
//   - si es "descuento" y todavía no tiene patente asignada, además lo ata a un
//     vehículo de la cuenta, para que el operador lo aplique con solo leer la
//     patente, sin tipear el código (ver cuponDescuentoVigente en
//     useOperadorFoundResult).
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }
  // Un código son 6 caracteres: sin límite, la cuenta sirve de oráculo para
  // adivinar tickets ajenos a fuerza bruta.
  if (rateLimited(`agregar-cupon:${clienteIp(request)}`, LIMITE_IP, VENTANA_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: { codigo?: unknown; patente?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const codigo = (typeof body.codigo === "string" ? body.codigo : "").trim().toUpperCase();
  if (!codigo) {
    return NextResponse.json({ ok: false, error: "Ingresa el código" }, { status: 400 });
  }

  try {
    const db = getDb();
    const [cupon] = await db.select().from(cupones).where(eq(cupones.codigo, codigo)).limit(1);
    if (!cupon) {
      return NextResponse.json({ ok: false, error: "No encontramos ese código" }, { status: 404 });
    }
    if (cupon.usado) {
      return NextResponse.json({ ok: false, error: "Ese código ya fue usado" }, { status: 409 });
    }
    if (new Date(cupon.fechaCaducidad) < new Date()) {
      return NextResponse.json({ ok: false, error: "Ese código está vencido" }, { status: 409 });
    }

    const email = sesion.email.trim().toLowerCase();
    if (cupon.email && cupon.email.trim().toLowerCase() !== email) {
      return NextResponse.json({ ok: false, error: "Ese código ya está en otra cuenta" }, { status: 409 });
    }

    const patentes = (await getClientesByIds(sesion.clienteIds)).map((c) => c.patente);
    let patenteAsignada = cupon.patenteAsignada;
    if (cupon.tipo === "descuento") {
      if (patenteAsignada && !patentes.includes(patenteAsignada)) {
        return NextResponse.json({ ok: false, error: `Ese descuento es de la patente ${patenteAsignada}` }, { status: 409 });
      }
      if (!patenteAsignada) {
        // Con un solo vehículo no se le pregunta nada al cliente; con varios el
        // formulario manda cuál. Sin vehículos el descuento igual se guarda en
        // la cuenta: queda "abierto" y el operador lo aplica tipeando el código
        // (ver resolverDescuento).
        const elegida = normPlate(typeof body.patente === "string" ? body.patente : "");
        if (elegida && !patentes.includes(elegida)) {
          return NextResponse.json({ ok: false, error: "Esa patente no es de tu cuenta" }, { status: 400 });
        }
        patenteAsignada = elegida || (patentes.length === 1 ? patentes[0] : null);
      }
    }

    await db.update(cupones).set({ email, patenteAsignada }).where(eq(cupones.id, cupon.id));

    return NextResponse.json({ ok: true, tipo: cupon.tipo, patenteAsignada });
  } catch (error) {
    console.error("Error agregando cupón a la cuenta", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }
}
