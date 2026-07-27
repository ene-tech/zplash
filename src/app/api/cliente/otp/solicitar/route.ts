import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { otpsCliente } from "@/db/schema";
import { buscarClientePorPatente, buscarClientesPorTelefono } from "@/lib/dataAccess/clientes";
import { enviarMensajePlantilla } from "@/lib/whatsapp/enviar";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { origenValido } from "@/lib/csrf";
import { normPlate, isValidPatente, formatTelefono, isValidTelefono, uid } from "@/lib/helpers";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

const LIMITE_IP = 8;
const VENTANA_IP_MS = 5 * 60 * 1000;

// Límite por teléfono objetivo, más estricto que el de perfiles: cada
// intento manda un mensaje de plantilla pago, así que además de frenar
// abuso acá se acota el costo directo.
const LIMITE_TELEFONO = 5;
const VENTANA_TELEFONO_MS = 10 * 60 * 1000;

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

  let body: { patente?: unknown; telefono?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = typeof body.patente === "string" ? body.patente.trim() : "";
  const telefonoIngresado = typeof body.telefono === "string" ? body.telefono.trim() : "";
  if (!patente && !telefonoIngresado) {
    return NextResponse.json({ ok: false, error: "Ingresa tu patente o tu teléfono" }, { status: 400 });
  }

  let telefono: string;
  try {
    if (patente) {
      if (!isValidPatente(patente)) {
        return NextResponse.json({ ok: false, error: "Patente inválida" }, { status: 400 });
      }
      const cliente = await buscarClientePorPatente(normPlate(patente));
      if (!cliente) {
        return NextResponse.json({ ok: false, error: "No encontramos esa patente" }, { status: 404 });
      }
      if (!cliente.telefono) {
        return NextResponse.json(
          { ok: false, error: "Este vehículo no tiene un teléfono registrado. Escríbenos por WhatsApp para vincularlo." },
          { status: 400 }
        );
      }
      telefono = cliente.telefono;
    } else {
      const normalizado = formatTelefono(telefonoIngresado);
      if (!isValidTelefono(normalizado) || !normalizado) {
        return NextResponse.json({ ok: false, error: "Teléfono inválido. Usa formato +56912345678." }, { status: 400 });
      }
      const clientesEncontrados = await buscarClientesPorTelefono(normalizado);
      if (!clientesEncontrados.length) {
        return NextResponse.json({ ok: false, error: "No encontramos ese teléfono" }, { status: 404 });
      }
      telefono = normalizado;
    }
  } catch (error) {
    console.error("Error buscando cliente para OTP", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  if (rateLimited(`cliente-otp-objetivo:${telefono}`, LIMITE_TELEFONO, VENTANA_TELEFONO_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados códigos solicitados para este teléfono, espera unos minutos" }, { status: 429 });
  }

  const codigo = generarCodigo();
  const codigoHash = await bcrypt.hash(codigo, 10);

  try {
    await getDb().insert(otpsCliente).values({
      id: uid(),
      telefono,
      codigoHash,
      expiraEn: new Date(Date.now() + DURACION_CODIGO_MS).toISOString(),
    });
  } catch (error) {
    console.error("Error guardando código OTP", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }

  const nombrePlantilla = process.env.WHATSAPP_OTP_TEMPLATE_NOMBRE;
  if (!nombrePlantilla) {
    console.error("Falta WHATSAPP_OTP_TEMPLATE_NOMBRE en las variables de entorno");
    return NextResponse.json({ ok: false, error: "Envío de códigos aún no configurado" }, { status: 500 });
  }

  const idioma = process.env.WHATSAPP_OTP_TEMPLATE_IDIOMA || "es";
  const mensaje = await enviarMensajePlantilla(telefono, nombrePlantilla, idioma, [codigo], undefined, codigo);
  if (mensaje.estado === "fallido") {
    return NextResponse.json({ ok: false, error: "No pudimos enviar el código por WhatsApp, intenta de nuevo" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, telefono });
}
