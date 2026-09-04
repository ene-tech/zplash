import { NextRequest, NextResponse } from "next/server";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { crearComentarioLibro, listarComentariosLibro } from "@/lib/dataAccess/libro";
import { uid } from "@/lib/helpers";
import { LIBRO_MENSAJE_MAX, TIPOS_LIBRO, type TipoLibro } from "@/types";

export const runtime = "nodejs";

// El chequeo de `email` no es paranoia: leerCookieFirmada valida firma y
// expiración pero no la FORMA del payload, y hay cookies de cliente vigentes
// (duran 30 días) emitidas cuando el payload aún no traía email. Sin este
// guard, un email undefined convertiría el GET en "el libro completo" (ver
// listarComentariosLibro) y el POST en un 500 por NOT NULL.
async function sesionConEmail() {
  const sesion = await leerSesionCliente();
  return sesion?.email ? sesion : null;
}

// Las entradas del propio cliente, para que Mi Cuenta las muestre como un
// libro y no como un formulario que se traga lo escrito.
export async function GET() {
  const sesion = await sesionConEmail();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }
  const comentarios = await listarComentariosLibro(sesion.email);
  return NextResponse.json({ ok: true, comentarios });
}

export async function POST(request: NextRequest) {
  const sesion = await sesionConEmail();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  // Mismo criterio que otp/solicitar: JSON.parse acepta `null` y campos de
  // cualquier tipo, así que forma y typeof se validan antes de tocar nada.
  let body: { tipo?: unknown; mensaje?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const tipo = body.tipo as TipoLibro;
  if (typeof tipo !== "string" || !TIPOS_LIBRO.includes(tipo)) {
    return NextResponse.json({ ok: false, error: "Tipo inválido" }, { status: 400 });
  }
  const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim() : "";
  if (!mensaje) {
    return NextResponse.json({ ok: false, error: "Escribe tu mensaje antes de enviarlo." }, { status: 400 });
  }
  if (mensaje.length > LIBRO_MENSAJE_MAX) {
    return NextResponse.json({ ok: false, error: `El mensaje no puede superar los ${LIBRO_MENSAJE_MAX} caracteres.` }, { status: 400 });
  }

  // sesion.email ya viene en minúsculas (ver /api/cliente/otp/solicitar) y
  // crearComentarioLibro lo re-normaliza igual; es lo que la ficha de cliente
  // y la vista Libro usan para identificar.
  const ok = await crearComentarioLibro({ id: uid(), email: sesion.email, tipo, mensaje });
  if (!ok) {
    return NextResponse.json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
