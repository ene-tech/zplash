import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { otpsCliente } from "@/db/schema";
import { PATENTE_CON_DUENO_MSG, buscarClientePorPatente, buscarClientesPorEmail } from "@/lib/dataAccess/clientes";
import { enviarCodigoOtpCliente } from "@/lib/buzon/otp";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { origenValido } from "@/lib/csrf";
import { PATENTE_FORMATO_MSG, normPlate, isValidPatente, isValidEmail, sigueVigenteHoy, uid } from "@/lib/helpers";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

const LIMITE_IP = 8;
const VENTANA_IP_MS = 5 * 60 * 1000;

// Límite por correo objetivo, más estricto que el de perfiles, para acotar
// abuso (spam de códigos a un mismo destinatario).
const LIMITE_EMAIL = 5;
const VENTANA_EMAIL_MS = 10 * 60 * 1000;

const DURACION_CODIGO_MS = 5 * 60 * 1000;

// crypto.randomInt y no Math.random(): este código es la única credencial del
// Portal Cliente (da acceso a los datos del cliente y a la tarjeta guardada en
// Oneclick). Math.random() en V8 es xorshift128+, no un CSPRNG — con unas
// pocas salidas observadas se puede reconstruir su estado y predecir las
// siguientes, y acá cualquiera puede pedirse códigos a su propio correo.
function generarCodigo(): string {
  return String(crypto.randomInt(100000, 1000000));
}

// La respuesta ya no lleva el correo en limpio: mandar una patente cualquiera
// (login por patente, más abajo) devolvía el correo registrado de su dueño a
// cualquiera que lo pidiera, y bastaba con eso más /api/pagos/estado para
// armar patente → nombre + correo de toda la base. Ahora sale enmascarado
// solo para mostrarlo, y quien verifica el código usa `solicitudId` (ver
// otp/verificar), que es el id de la fila de otpsCliente — opaco y de un solo
// uso, así que no sirve para averiguar a qué correo se mandó.
function enmascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!dominio) return "***";
  const visible = usuario.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(usuario.length - 1, 1))}@${dominio}`;
}

export async function POST(request: NextRequest) {
  if (!origenValido(request)) {
    return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  }
  if (rateLimited(`cliente-otp-solicitar:${clienteIp(request)}`, LIMITE_IP, VENTANA_IP_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: { patente?: unknown; email?: unknown; nombre?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = typeof body.patente === "string" ? body.patente.trim() : "";
  const emailIngresado = typeof body.email === "string" ? body.email.trim() : "";
  // Con `nombre` esto es un registro de cliente nuevo (nombre + correo +
  // patente), no un login: el correo todavía no existe en `clientes`, así que
  // el código se manda al que la persona escribió y la ficha recién se crea
  // cuando lo verifica (ver otp/verificar). Sin nombre, todo igual que antes.
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  if (!patente && !emailIngresado) {
    return NextResponse.json({ ok: false, error: "Ingresa tu patente o tu correo" }, { status: 400 });
  }

  let email: string;
  try {
    if (nombre) {
      if (!isValidEmail(emailIngresado.toLowerCase())) {
        return NextResponse.json({ ok: false, error: "Correo inválido" }, { status: 400 });
      }
      if (!isValidPatente(patente)) {
        return NextResponse.json({ ok: false, error: PATENTE_FORMATO_MSG }, { status: 400 });
      }
      // Chequeo temprano, solo para no mandar un código que después no va a
      // servir de nada: el definitivo (que además descarta huérfanas con
      // tarjeta viva o ventas) corre dentro del lock de vincularPatenteACuenta
      // al verificar el código.
      const dueno = await buscarClientePorPatente(normPlate(patente));
      if (dueno && (dueno.email || sigueVigenteHoy(dueno.vencimiento))) {
        return NextResponse.json({ ok: false, error: PATENTE_CON_DUENO_MSG }, { status: 409 });
      }
      email = emailIngresado.toLowerCase();
    } else if (patente) {
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
  const solicitudId = uid();

  try {
    await getDb().insert(otpsCliente).values({
      id: solicitudId,
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

  return NextResponse.json({ ok: true, solicitudId, email: enmascararEmail(email) });
}
