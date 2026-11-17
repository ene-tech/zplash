import { NextRequest, NextResponse, after } from "next/server";
import { cerrarSesionCliente, leerSesionCliente } from "@/lib/auth/clienteSession";
import { eliminarCuentaCliente } from "@/lib/cliente/eliminarCuenta";
import { origenValido } from "@/lib/csrf";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { envolverCorreoBase } from "@/lib/mailing/plantillaBase";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

// "Eliminar mi cuenta" (Cuenta → Eliminar mi cuenta). Inmediato: ver
// @/lib/cliente/eliminarCuenta. Pide { confirmar: "ELIMINAR" } para que un
// POST suelto (o un doble toque) no borre nada sin la confirmación de la UI.
// Avisa por correo al cliente y a ZPlash; nada por WhatsApp.
const CORREO_ZPLASH = "contacto@zplash.cl";

export async function POST(request: NextRequest) {
  if (!origenValido(request)) {
    return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  }
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }
  if (await rateLimited(`eliminar-cuenta:${clienteIp(request)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }
  let body: { confirmar?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (body.confirmar !== "ELIMINAR") {
    return NextResponse.json({ ok: false, error: "Falta confirmar" }, { status: 400 });
  }

  const r = await eliminarCuentaCliente(sesion.email, sesion.clienteIds);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });

  await cerrarSesionCliente();

  const email = sesion.email;
  const lista = r.patentes.length ? r.patentes.join(", ") : "ninguna";
  after(async () => {
    await enviarCorreoTransaccional({
      to: email,
      subject: "Eliminamos tu cuenta de ZPlash",
      html: envolverCorreoBase(
        `Eliminamos tu cuenta de ZPlash como pediste.\n\nBorramos tu correo, nombre, teléfono, datos de factura y tarjeta guardada, y cancelamos el cobro automático. Solo conservamos las ventas y boletas que la ley obliga a guardar.\n\nSi no fuiste tú, escríbenos a ${CORREO_ZPLASH}.`,
        {}
      ),
    });
    await enviarCorreoTransaccional({
      to: CORREO_ZPLASH,
      subject: `Cuenta eliminada: ${email}`,
      html: envolverCorreoBase(
        `Un cliente eliminó su cuenta desde la app o la web.\n\nCorreo: ${email}\nPatentes: ${lista}\n\nSe dio de baja la tarjeta y se borraron sus datos personales.` +
          (r.wooSinCortar.length
            ? `\n\nATENCIÓN: no se pudo cortar la renovación de WooCommerce de ${r.wooSinCortar.join(", ")}. Hay que cancelarla a mano en WordPress.`
            : ""),
        {}
      ),
    });
  });

  return NextResponse.json({ ok: true });
}
