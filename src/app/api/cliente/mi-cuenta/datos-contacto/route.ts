import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse, after } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { otpsCliente } from "@/db/schema";
import { crearSesionCliente, leerSesionCliente } from "@/lib/auth/clienteSession";
import { enviarCodigoOtpCliente } from "@/lib/buzon/otp";
import { cambiarEmailCuenta, cambiarTelefonoCuenta } from "@/lib/cliente/cambiarContacto";
import { esCuentaRevision } from "@/lib/cliente/cuentaRevision";
import { buscarClientesPorEmail } from "@/lib/dataAccess/clientes";
import { origenValido } from "@/lib/csrf";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { envolverCorreoBase } from "@/lib/mailing/plantillaBase";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { TELEFONO_FORMATO_MSG, esCorreoDeRelleno, esEmailEnviable, formatTelefono, isValidTelefono, uid } from "@/lib/helpers";

export const runtime = "nodejs";

const DURACION_CODIGO_MS = 5 * 60 * 1000;
const LIMITE_INTENTOS_CODIGO = 5;
const CORREO_ZPLASH = "contacto@zplash.cl";

// "Mis datos" del portal cliente (ver @/lib/cliente/cambiarContacto).
//   { telefono }             → se guarda directo.
//   { email }                → manda un código al correo NUEVO (paso 1).
//   { solicitudId, codigo }  → lo verifica, cambia el correo y rehace la sesión (paso 2).
// El correo es la credencial del portal, así que no se cambia sin probar que
// el cliente lo recibe: un error de tipeo lo dejaría sin poder volver a entrar.
// Y se avisa al correo VIEJO, para que el dueño se entere si fue otro con su
// sesión abierta.
export async function POST(request: NextRequest) {
  if (!origenValido(request)) {
    return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  }
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }
  if (await rateLimited(`datos-contacto:${clienteIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: { telefono?: unknown; email?: unknown; solicitudId?: unknown; codigo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (!sesion.clienteIds.length) {
    return NextResponse.json({ ok: false, error: "Tu sesión expiró, vuelve a entrar" }, { status: 401 });
  }

  if (typeof body.telefono === "string") {
    const telefono = formatTelefono(body.telefono);
    if (!telefono || !isValidTelefono(telefono)) {
      return NextResponse.json({ ok: false, error: TELEFONO_FORMATO_MSG }, { status: 400 });
    }
    const ok = await cambiarTelefonoCuenta(sesion.email, sesion.clienteIds, telefono);
    if (!ok) return NextResponse.json({ ok: false, error: "No se pudo guardar el cambio" }, { status: 500 });
    return NextResponse.json({ ok: true, telefono });
  }

  if (esCuentaRevision(sesion.email)) {
    return NextResponse.json({ ok: false, error: "Esta cuenta de prueba no puede cambiar su correo" }, { status: 400 });
  }

  if (typeof body.email === "string") {
    const email = body.email.trim().toLowerCase();
    if (!esEmailEnviable(email) || esCorreoDeRelleno(email)) {
      return NextResponse.json({ ok: false, error: "Correo inválido" }, { status: 400 });
    }
    if (email === sesion.email.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Ese ya es tu correo" }, { status: 400 });
    }
    if (await rateLimited(`cliente-otp-objetivo:${email}`, 5, 10 * 60 * 1000)) {
      return NextResponse.json({ ok: false, error: "Demasiados códigos para ese correo, espera unos minutos" }, { status: 429 });
    }
    const codigo = String(crypto.randomInt(100000, 1000000));
    const solicitudId = uid();
    try {
      await getDb()
        .insert(otpsCliente)
        .values({ id: solicitudId, email, codigoHash: await bcrypt.hash(codigo, 10), expiraEn: new Date(Date.now() + DURACION_CODIGO_MS).toISOString() });
    } catch (error) {
      console.error("Mis datos: error guardando código", error);
      return NextResponse.json({ ok: false, error: "Error de servidor, intenta de nuevo" }, { status: 500 });
    }
    const envio = await enviarCodigoOtpCliente(email, codigo);
    if (!envio.ok) {
      return NextResponse.json({ ok: false, error: "No pudimos enviar el código a ese correo. Revisa que esté bien escrito." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, solicitudId });
  }

  const solicitudId = typeof body.solicitudId === "string" ? body.solicitudId.trim() : "";
  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  if (!solicitudId || !/^\d{6}$/.test(codigo)) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }
  const db = getDb();
  // El intento se cuenta en el mismo UPDATE que lo valida (atómico): con
  // requests en paralelo no se puede pasar del límite de intentos.
  const [fila] = await db
    .update(otpsCliente)
    .set({ intentos: sql`${otpsCliente.intentos} + 1` })
    .where(
      and(
        eq(otpsCliente.id, solicitudId),
        isNull(otpsCliente.usadoEn),
        sql`${otpsCliente.intentos} < ${LIMITE_INTENTOS_CODIGO}`,
        sql`${otpsCliente.expiraEn} > now()`
      )
    )
    .returning();
  if (!fila) {
    return NextResponse.json({ ok: false, error: "Código inválido o expirado, pide uno nuevo" }, { status: 400 });
  }
  if (!(await bcrypt.compare(codigo, fila.codigoHash))) {
    return NextResponse.json({ ok: false, error: "Código incorrecto" }, { status: 400 });
  }
  // Un solo uso: de dos requests con el código correcto, solo una lo marca.
  const [consumida] = await db
    .update(otpsCliente)
    .set({ usadoEn: new Date().toISOString() })
    .where(and(eq(otpsCliente.id, fila.id), isNull(otpsCliente.usadoEn)))
    .returning({ id: otpsCliente.id });
  if (!consumida) {
    return NextResponse.json({ ok: false, error: "Código inválido o expirado, pide uno nuevo" }, { status: 400 });
  }

  const emailViejo = sesion.email;
  const emailNuevo = fila.email;
  const ok = await cambiarEmailCuenta(emailViejo, sesion.clienteIds, emailNuevo);
  if (!ok) {
    // Que pueda reintentar con el mismo código en vez de pedir otro.
    await db.update(otpsCliente).set({ usadoEn: null }).where(eq(otpsCliente.id, fila.id));
    return NextResponse.json({ ok: false, error: "No se pudo guardar el cambio, intenta de nuevo" }, { status: 500 });
  }

  // La cookie firma el correo: sin rehacerla, leerSesionCliente descartaría
  // todas las fichas (ya no tienen el correo viejo). Si el correo nuevo ya
  // tenía otras patentes, la cuenta queda con todas. Otros dispositivos con
  // la sesión vieja quedan sin vehículos y tienen que volver a entrar.
  const ids = (await buscarClientesPorEmail(emailNuevo)).map((c) => c.id);
  await crearSesionCliente(ids, emailNuevo);

  after(async () => {
    await enviarCorreoTransaccional({
      to: emailViejo,
      subject: "Cambiaste el correo de tu cuenta ZPlash",
      html: envolverCorreoBase(
        `El correo de tu cuenta ZPlash se cambió a ${emailNuevo}. Desde ahora entras a Mi Cuenta con ese correo.\n\nSi no fuiste tú, escríbenos de inmediato a ${CORREO_ZPLASH}.`,
        {}
      ),
    });
  });

  return NextResponse.json({ ok: true, email: emailNuevo });
}
