import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suscripcionesOneclick } from "@/db/schema";
import { isValidEmail, isValidPatente, normPlate, uid } from "@/lib/helpers";
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
    if (rateLimited(`oneclick-inscribir:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    let body: { patente?: string; email?: string; soloGuardar?: boolean };
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
    const returnUrl = new URL("/api/pagos/oneclick/inscripcion/retorno", request.nextUrl.origin).toString();
    const respuesta = await oneclickInscription().start(patente, email, returnUrl);

    // Si ya había una inscripción pendiente/cancelada para esta patente, se
    // reemplaza; una "activa" también se puede re-inscribir (ej. cambiar de
    // tarjeta). El upsert va por `patente`, que es lo que la fila representa
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

    if (existente) {
      await db
        .update(suscripcionesOneclick)
        .set({
          email,
          tokenInscripcion: respuesta.token,
          estado: estadoPendiente,
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
