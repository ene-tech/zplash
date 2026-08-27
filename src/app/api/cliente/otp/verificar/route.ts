import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { otpsCliente } from "@/db/schema";
import { buscarClientesPorEmail, vincularPatenteACuenta } from "@/lib/dataAccess/clientes";
import { crearSesionCliente } from "@/lib/auth/clienteSession";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { origenValido } from "@/lib/csrf";
import { PATENTE_FORMATO_MSG, isValidPatente, normPlate } from "@/lib/helpers";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

const LIMITE_IP = 15;
const VENTANA_IP_MS = 10 * 60 * 1000;
const LIMITE_INTENTOS_CODIGO = 5;

export async function POST(request: NextRequest) {
  if (!origenValido(request)) {
    return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  }
  if (rateLimited(`cliente-otp-verificar:${clienteIp(request)}`, LIMITE_IP, VENTANA_IP_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: { solicitudId?: unknown; codigo?: unknown; nombre?: unknown; patente?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  // `solicitudId` (el id de la fila de otpsCliente que devolvió
  // otp/solicitar) en vez del correo: así la respuesta de solicitar no tiene
  // que revelar a qué dirección se mandó el código — antes la mandaba en
  // limpio justamente para poder reenviarla acá. De paso desaparece la
  // ambigüedad del "último código sin usar de este correo": se verifica
  // contra la solicitud exacta que originó el código.
  const solicitudId = typeof body.solicitudId === "string" ? body.solicitudId.trim() : "";
  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  if (!solicitudId || !/^\d{6}$/.test(codigo)) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  // Registro de cliente nuevo (ver otp/solicitar): la ficha se crea recién acá,
  // después de comprobar que el código llegó al correo que la persona declaró
  // — antes de eso no hay nada verificado que justifique escribir en la base.
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const patente = normPlate(typeof body.patente === "string" ? body.patente : "");
  const esRegistro = !!nombre;
  if (esRegistro && !isValidPatente(patente)) {
    return NextResponse.json({ ok: false, error: PATENTE_FORMATO_MSG }, { status: 400 });
  }

  const db = getDb();
  let fila: typeof otpsCliente.$inferSelect | undefined;
  try {
    [fila] = await db
      .select()
      .from(otpsCliente)
      .where(and(eq(otpsCliente.id, solicitudId), isNull(otpsCliente.usadoEn)))
      .limit(1);
  } catch (error) {
    console.error("Error consultando código OTP", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  if (!fila || new Date(fila.expiraEn).getTime() < Date.now() || fila.intentos >= LIMITE_INTENTOS_CODIGO) {
    return NextResponse.json({ ok: false, error: "Código inválido o expirado, solicita uno nuevo" }, { status: 400 });
  }
  // El correo sale de la fila, no del cuerpo del request: es el que resolvió
  // otp/solicitar (por patente o por correo) y el único al que se mandó este
  // código, así que no hay forma de verificar un código contra otra cuenta.
  const email = fila.email;

  const coincide = await bcrypt.compare(codigo, fila.codigoHash);
  if (!coincide) {
    await db.update(otpsCliente).set({ intentos: fila.intentos + 1 }).where(eq(otpsCliente.id, fila.id));
    return NextResponse.json({ ok: false, error: "Código incorrecto" }, { status: 400 });
  }

  await db.update(otpsCliente).set({ usadoEn: new Date().toISOString() }).where(eq(otpsCliente.id, fila.id));

  const clientesEncontrados = await buscarClientesPorEmail(email);
  const ids = clientesEncontrados.map((c) => c.id);

  if (esRegistro) {
    // vincularPatenteACuenta crea la ficha o reclama una huérfana (un alta por
    // WhatsApp o del mostrador que nunca tuvo correo, que es justamente el
    // cliente que llega acá a registrarse); con dueño activo devuelve error.
    const vinculo = await vincularPatenteACuenta(patente, nombre, email, "Portal Cliente (Registro)");
    if (!vinculo.ok) {
      return NextResponse.json({ ok: false, error: vinculo.error }, { status: 409 });
    }
    if (!ids.includes(vinculo.clienteId)) ids.push(vinculo.clienteId);
  } else if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Este correo ya no está asociado a ningún vehículo" }, { status: 404 });
  }

  await crearSesionCliente(ids, email);
  return NextResponse.json({ ok: true });
}
