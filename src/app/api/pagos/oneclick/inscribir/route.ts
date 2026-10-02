import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { perfiles, suscripcionesOneclick } from "@/db/schema";
import { conservaTarjetaAlReinscribir, isValidEmail, isValidPatente, MARCA_SOLO_TARJETA, normPlate, uid } from "@/lib/helpers";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { oneclickInscription } from "@/lib/transbank";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 10;
const VENTANA_MS = 5 * 60 * 1000;

// Inicia la inscripción de tarjeta para renovación automática mensual.
// username exigido por Transbank = patente normalizada (única por diseño de
// la tabla clientes, y no cambia si el cliente ya existe o es nuevo).
export async function POST(request: NextRequest) {
  try {
    if (await rateLimited(`oneclick-inscribir:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    let body: { patente?: string; email?: string; soloGuardar?: boolean; operador?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const patente = normPlate(body.patente);
    if (!isValidPatente(patente)) {
      return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
    }
    const email = (body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    // "pendiente_solo_tarjeta" viaja hasta /inscripcion/retorno (vía la misma
    // fila) para que ese callback sepa que esto vino de "Mis tarjetas" y no
    // debe cobrar de inmediato como sí hace el flujo normal de /pagar — ver
    // el comentario en /inscripcion/retorno/route.ts.
    const estadoPendiente = body.soloGuardar ? "pendiente_solo_tarjeta" : "pendiente";

    const db = getDb();

    // Operador del QR del mesón (?op= en /pagar): viene del cliente, así que
    // solo cuenta si es el id de un perfil que existe, y se guarda su nombre.
    // Se escribe siempre (null si no vino) para que una inscripción posterior
    // desde otra puerta no herede la atribución de la anterior.
    const [perfilQr] =
      typeof body.operador === "string" && body.operador
        ? await db.select({ nombre: perfiles.nombre }).from(perfiles).where(eq(perfiles.id, body.operador)).limit(1)
        : [];
    const operadorQr = perfilQr?.nombre ?? null;

    // La aceptación del paso al X5 (clientes.aceptoX5En) se graba al VOLVER de
    // Transbank, no acá: este endpoint es público —solo pide una patente, que
    // va pintada en el auto— y esa marca es justamente la que levanta el
    // candado de cobrarSuscripcion. Grabándola acá, un POST con la patente de
    // un cliente del ilimitado viejo le daba el sí en su nombre y el cron le
    // cobraba la migración al X5 con su propia tarjeta. Ver
    // /inscripcion/retorno, que la graba con la inscripción ya confirmada por
    // Transbank y antes del primer cobro.

    const returnUrl = new URL("/api/pagos/oneclick/inscripcion/retorno", request.nextUrl.origin).toString();
    const respuesta = await oneclickInscription().start(patente, email, returnUrl);

    // Si ya había una inscripción pendiente/cancelada para esta patente, se
    // reemplaza; una "activa" también se puede re-inscribir (ej. cambiar de
    // tarjeta), y en ese caso el estado NO se toca — ver
    // conservaTarjetaAlReinscribir. El upsert va por `patente`, que es lo que la fila representa
    // (un ciclo de cobro) y lo que tiene el índice único — `username` dejó de
    // ser único al permitir que varias patentes compartan una tarjeta (ver
    // migración 0090).
    //
    // `username` NO se toca acá aunque start() ya se llamó con la patente: si
    // esta fila venía usando la tarjeta compartida de otro auto y el cliente
    // abandona Transbank, tiene que seguir cobrable con el par (username,
    // tbkUser) viejo. Lo reescribe /inscripcion/retorno recién cuando llega
    // el tbkUser nuevo, que es cuando los dos campos cambian juntos.
    const [existente] = await db
      .select()
      .from(suscripcionesOneclick)
      .where(eq(suscripcionesOneclick.patente, patente))
      .limit(1);

    // Cambiar la tarjeta de una suscripción que ya cobra no la puede apagar: se
    // conserva el estado y la inscripción en vuelo la marca el token, que es lo
    // único que el callback necesita para encontrar la fila. El bit de
    // soloGuardar viaja pegado al token porque el estado ya no lo lleva (ver
    // esInscripcionSoloTarjeta). Sin esto, el cliente que abandonaba Transbank
    // quedaba en "pendiente" —tarjeta invisible en Mi Cuenta, cron sin cobrar—
    // y si volvía con un rechazo, en "cancelada" (5 suscripciones así en
    // sep-2026). Lo mismo que ya esquivaba /api/cliente/mi-cuenta/cobrar-oferta
    // por su lado, ahora vale para todas las puertas.
    const conservaTarjeta = conservaTarjetaAlReinscribir(existente);

    if (existente) {
      await db
        .update(suscripcionesOneclick)
        .set({
          // El correo de una tarjeta que ya cobra no se toca: este endpoint es
          // público y pide solo la patente (va pintada en el auto), así que
          // cualquiera podía poner el suyo y quedarse con los avisos de cobro
          // y, vía aplicarPagoAprobado, con el acceso a Mi Cuenta de una ficha
          // sin correo. Una fila sin tarjeta viva no tiene nada que robar.
          ...(conservaTarjeta ? {} : { email }),
          tokenInscripcion: conservaTarjeta && body.soloGuardar ? respuesta.token + MARCA_SOLO_TARJETA : respuesta.token,
          ...(conservaTarjeta ? {} : { estado: estadoPendiente }),
          operadorQr,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(suscripcionesOneclick.id, existente.id));
    } else {
      await db.insert(suscripcionesOneclick).values({
        id: uid(),
        patente,
        username: patente,
        email,
        tokenInscripcion: respuesta.token,
        estado: estadoPendiente,
        operadorQr,
      });
    }

    // La API de Transbank devuelve el campo en snake_case ("url_webpay"), a
    // diferencia de Webpay Plus Transaction.create() que devuelve "url".
    return NextResponse.json({ url: respuesta.url_webpay, token: respuesta.token });
  } catch (error) {
    console.error("Error en /api/pagos/oneclick/inscribir", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
