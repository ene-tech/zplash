import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { otpsCliente } from "@/db/schema";
import { buscarClientesPorEmail } from "@/lib/dataAccess/clientes";
import { crearSesionCliente } from "@/lib/auth/clienteSession";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { origenValido } from "@/lib/csrf";
import { isValidEmail } from "@/lib/helpers";
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

  let body: { email?: unknown; codigo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const email = (typeof body.email === "string" ? body.email.trim() : "").toLowerCase();
  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  if (!isValidEmail(email) || !/^\d{6}$/.test(codigo)) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  const db = getDb();
  let fila: typeof otpsCliente.$inferSelect | undefined;
  try {
    [fila] = await db
      .select()
      .from(otpsCliente)
      .where(and(eq(otpsCliente.email, email), isNull(otpsCliente.usadoEn)))
      .orderBy(desc(otpsCliente.creadoEn))
      .limit(1);
  } catch (error) {
    console.error("Error consultando código OTP", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  if (!fila || new Date(fila.expiraEn).getTime() < Date.now() || fila.intentos >= LIMITE_INTENTOS_CODIGO) {
    return NextResponse.json({ ok: false, error: "Código inválido o expirado, solicita uno nuevo" }, { status: 400 });
  }

  const coincide = await bcrypt.compare(codigo, fila.codigoHash);
  if (!coincide) {
    await db.update(otpsCliente).set({ intentos: fila.intentos + 1 }).where(eq(otpsCliente.id, fila.id));
    return NextResponse.json({ ok: false, error: "Código incorrecto" }, { status: 400 });
  }

  await db.update(otpsCliente).set({ usadoEn: new Date().toISOString() }).where(eq(otpsCliente.id, fila.id));

  const clientesEncontrados = await buscarClientesPorEmail(email);
  if (!clientesEncontrados.length) {
    return NextResponse.json({ ok: false, error: "Este correo ya no está asociado a ningún vehículo" }, { status: 404 });
  }

  await crearSesionCliente(
    clientesEncontrados.map((c) => c.id),
    email
  );
  return NextResponse.json({ ok: true });
}
