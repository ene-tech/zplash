import { NextRequest, NextResponse } from "next/server";
import { origenValido } from "@/lib/csrf";
import { buscarClientePorPatente } from "@/lib/dataAccess/clientes";
import { emitirCuponDescuentoPrimeraVez, getConfig } from "@/lib/dataAccess";
import { fmtCLP, isValidEmail, isValidPatente, normPlate } from "@/lib/helpers";
import { envolverCorreoBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_IP = 5;
const VENTANA_IP_MS = 10 * 60 * 1000;

// Gemelo por web de la Opción 5 del bot de WhatsApp (ver @/lib/whatsapp/
// router): el visitante nuevo deja patente + correo en el pop-up de la
// landing y recibe el mismo cupón "descuento" de primera vez, con el monto y
// la vigencia de ConfigGlobal.descuentoPrimeraVezValor/DiasValidez (Web
// Settings → Menú Bot WhatsApp) — un solo lugar donde cambiar la promo para
// los dos canales.
//
// A diferencia del flujo de WhatsApp, NO crea un Cliente: acá no se pide el
// nombre ni hay teléfono verificado, y una ficha a medias es exactamente lo
// que ensucia la base (ver scripts/auditar-datos-clientes.ts). El cupón queda
// atado a la patente —que es lo que el operador reconoce al llegar el auto,
// sin código, ver OperadorFoundResult— y el correo capturado queda en la
// bandeja de salida (Correo → Salida automática).
export async function POST(request: NextRequest) {
  if (!origenValido(request)) {
    return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  }
  if (rateLimited(`descuento-bienvenida:${clienteIp(request)}`, LIMITE_IP, VENTANA_IP_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: { patente?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = normPlate(typeof body.patente === "string" ? body.patente : "");
  const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
  if (!isValidPatente(patente)) {
    return NextResponse.json({ ok: false, error: "Patente inválida" }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Correo inválido" }, { status: 400 });
  }

  try {
    if (await buscarClientePorPatente(patente)) {
      return NextResponse.json(
        { ok: false, error: "Esa patente ya está registrada en ZPlash — el descuento es solo para la primera vez." },
        { status: 409 }
      );
    }

    const config = await getConfig();
    const cupon = await emitirCuponDescuentoPrimeraVez({
      patente,
      valor: config.descuentoPrimeraVezValor,
      diasValidez: config.descuentoPrimeraVezDiasValidez,
      nombreLote: "Web - Primera vez",
      creadoPor: "landing-web",
    });

    // El envío puede fallar (proveedor caído, dirección mala) sin invalidar el
    // descuento: el cupón ya existe y el pop-up muestra el código en pantalla.
    // Por eso `correoEnviado` viaja en la respuesta en vez de tumbar el 200 —
    // la UI solo cambia la frase de "te lo enviamos" a "anótalo".
    const envio = await enviarCorreoTransaccional({
      to: email,
      subject: `Tu descuento de ${fmtCLP(cupon.valor)} en tu primer lavado`,
      html: envolverCorreoBase(
        "¡Bienvenido a ZPlash!\n\n" +
          "Tu descuento de **{{monto}}** ya quedó guardado en la patente {{patente}}.\n\n" +
          "Ahora solo llegar y pasar: lo aplicamos de forma automática en tu próxima visita, no tienes que mostrar nada.\n\n" +
          "Código de respaldo: **{{codigo}}** — válido hasta el {{fecha}}.",
        {
          monto: fmtCLP(cupon.valor),
          patente,
          codigo: cupon.codigo,
          fecha: new Date(cupon.fechaCaducidad).toLocaleDateString("es-CL"),
        }
      ),
    });

    return NextResponse.json({
      ok: true,
      codigo: cupon.codigo,
      valor: cupon.valor,
      fechaCaducidad: cupon.fechaCaducidad,
      correoEnviado: envio.ok,
    });
  } catch (error) {
    console.error("Error emitiendo descuento de bienvenida", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }
}
