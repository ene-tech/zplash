import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { otpsCliente } from "@/db/schema";
import { buscarClientePorPatente, buscarClientesPorEmail } from "@/lib/dataAccess/clientes";
import { enviarCodigoOtpCliente } from "@/lib/buzon/otp";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { origenValido } from "@/lib/csrf";
import { normPlate, isValidPatente, isValidEmail, uid } from "@/lib/helpers";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

const LIMITE_IP = 8;
const VENTANA_IP_MS = 5 * 60 * 1000;

// Límite por correo objetivo, más estricto que el de perfiles, para acotar
// abuso (spam de códigos a un mismo destinatario).
const LIMITE_EMAIL = 5;
const VENTANA_EMAIL_MS = 10 * 60 * 1000;

const DURACION_CODIGO_MS = 5 * 60 * 1000;

function generarCodigo(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: NextRequest) {
  if (!origenValido(request)) {
    return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  }
  if (rateLimited(`cliente-otp-solicitar:${clienteIp(request)}`, LIMITE_IP, VENTANA_IP_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: { patente?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = typeof body.patente === "string" ? body.patente.trim() : "";
  const emailIngresado = typeof body.email === "string" ? body.email.trim() : "";
  if (!patente && !emailIngresado) {
    return NextResponse.json({ ok: false, error: "Ingresa tu patente o tu correo" }, { status: 400 });
  }

  let email: string;
  try {
    if (patente) {
      if (!isValidPatente(patente)) {
        return NextResponse.json({ ok: false, error: "Patente inválida" }, { status: 400 });
      }
      const cliente = await buscarClientePorPatente(normPlate(patente));
      if (!cliente) {
        return NextResponse.json({ ok: false, error: "No encontramos esa patente" }, { status: 404 });
      }
      if (!cliente.email) {
        return NextResponse.json(
          { ok: false, error: "Este vehículo no tiene un correo registrado. Escríbenos por WhatsApp para vincularlo." },
          { status: 400 }
        );
      }
      email = cliente.email.trim().toLowerCase();
    } else {
      const normalizado = emailIngresado.trim().toLowerCase();
      if (!isValidEmail(normalizado)) {
        return NextResponse.json({ ok: false, error: "Correo inválido" }, { status: 400 });
      }
      const clientesEncontrados = await buscarClientesPorEmail(normalizado);
      if (!clientesEncontrados.length) {
        return NextResponse.json({ ok: false, error: "No encontramos ese correo" }, { status: 404 });
      }
      email = normalizado;
    }
  } catch (error) {
    console.error("Error buscando cliente para OTP", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  if (rateLimited(`cliente-otp-objetivo:${email}`, LIMITE_EMAIL, VENTANA_EMAIL_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados códigos solicitados para este correo, espera unos minutos" }, { status: 429 });
  }

  const codigo = generarCodigo();
  const codigoHash = await bcrypt.hash(codigo, 10);

  try {
    await getDb().insert(otpsCliente).values({
      id: uid(),
      email,
      codigoHash,
      expiraEn: new Date(Date.now() + DURACION_CODIGO_MS).toISOString(),
    });
  } catch (error) {
    console.error("Error guardando código OTP", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  const envio = await enviarCodigoOtpCliente(email, codigo);
  if (!envio.ok) {
    return NextResponse.json({ ok: false, error: "No pudimos enviar el código por correo, intenta de nuevo" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, email });
}
