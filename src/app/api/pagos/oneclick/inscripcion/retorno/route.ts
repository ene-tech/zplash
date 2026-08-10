import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, suscripcionesOneclick } from "@/db/schema";
import { cobrarSuscripcion } from "@/lib/pagos";
import { oneclickInscription } from "@/lib/transbank";

export const runtime = "nodejs";

function redirectResultado(origin: string, estado: string): NextResponse {
  const url = new URL("/pagar/resultado", origin);
  url.searchParams.set("estado", estado);
  return NextResponse.redirect(url, { status: 303 });
}

// Igual que Webpay Plus, el retorno de la inscripción llega con TBK_TOKEN
// por GET en API 1.1+ (POST en versiones anteriores) — se aceptan ambos.
async function procesarRetorno(origin: string, tbkToken: string | null): Promise<NextResponse> {
  if (!tbkToken) {
    return redirectResultado(origin, "error");
  }

  const db = getDb();
  const [suscripcion] = await db
    .select()
    .from(suscripcionesOneclick)
    .where(eq(suscripcionesOneclick.tokenInscripcion, tbkToken))
    .limit(1);
  if (!suscripcion) {
    console.error("Suscripción Oneclick no encontrada para token", tbkToken);
    return redirectResultado(origin, "error");
  }

  // "pendiente_solo_tarjeta" = inscripción disparada desde "Mis tarjetas" en
  // Mi Cuenta (ver /api/pagos/oneclick/inscribir): a diferencia del flujo de
  // /pagar, acá el cliente solo quiere guardar la tarjeta, no pagar un ciclo
  // ahora — más abajo no se llama a cobrarSuscripcion() para ese caso.
  const esSoloTarjeta = suscripcion.estado === "pendiente_solo_tarjeta";
  if (suscripcion.estado !== "pendiente" && !esSoloTarjeta) {
    // Ya procesado (doble callback): no repetir el cobro inmediato.
    return redirectResultado(origin, suscripcion.estado === "activa" ? "ok" : "anulado");
  }

  let resultado: { response_code: number; tbk_user?: string; authorization_code?: string; card_type?: string; card_number?: string };
  try {
    resultado = await oneclickInscription().finish(tbkToken);
  } catch (error) {
    console.error("Error confirmando inscripción Oneclick", error);
    await db
      .update(suscripcionesOneclick)
      .set({ estado: "cancelada", tokenInscripcion: null, actualizadoEn: new Date().toISOString() })
      .where(eq(suscripcionesOneclick.id, suscripcion.id));
    return redirectResultado(origin, esSoloTarjeta ? "tarjeta_error" : "error");
  }

  if (resultado.response_code !== 0 || !resultado.tbk_user) {
    await db
      .update(suscripcionesOneclick)
      .set({ estado: "cancelada", tokenInscripcion: null, actualizadoEn: new Date().toISOString() })
      .where(eq(suscripcionesOneclick.id, suscripcion.id));
    return redirectResultado(origin, esSoloTarjeta ? "tarjeta_anulada" : "anulado");
  }

  if (esSoloTarjeta) {
    // Sin cobro inmediato: si la patente tiene un plan vigente, el próximo
    // cobro automático queda agendado justo para su vencimiento real (nunca
    // antes, para no duplicar lo que el cliente ya pagó por otro medio). Si
    // no tiene plan vigente, la tarjeta queda guardada pero sin fecha de
    // cobro — el cron (que solo mira proximoCobro <= ahora) la deja en paz
    // hasta que el cliente contrate/renueve y quede con un vencimiento real.
    const [cliente] = await db.select({ vencimiento: clientes.vencimiento }).from(clientes).where(eq(clientes.patente, suscripcion.patente)).limit(1);
    const vencimientoFuturo = cliente?.vencimiento && new Date(cliente.vencimiento) > new Date() ? cliente.vencimiento : null;

    await db
      .update(suscripcionesOneclick)
      .set({
        tbkUser: resultado.tbk_user,
        cardTipo: resultado.card_type || null,
        cardUltimosDigitos: resultado.card_number || null,
        estado: "activa",
        proximoCobro: vencimientoFuturo,
        tokenInscripcion: null,
        actualizadoEn: new Date().toISOString(),
      })
      .where(eq(suscripcionesOneclick.id, suscripcion.id));

    return redirectResultado(origin, "tarjeta_guardada");
  }

  const activada = {
    ...suscripcion,
    tbkUser: resultado.tbk_user,
    estado: "activa" as const,
    proximoCobro: new Date().toISOString(),
  };
  await db
    .update(suscripcionesOneclick)
    .set({
      tbkUser: resultado.tbk_user,
      cardTipo: resultado.card_type || null,
      cardUltimosDigitos: resultado.card_number || null,
      estado: "activa",
      proximoCobro: activada.proximoCobro,
      tokenInscripcion: null,
      actualizadoEn: new Date().toISOString(),
    })
    .where(eq(suscripcionesOneclick.id, suscripcion.id));

  // Tarjeta inscrita: cobra ya mismo en vez de esperar al cron del día
  // siguiente, para que el plan quede activo de inmediato.
  try {
    const { estado } = await cobrarSuscripcion(activada);
    return redirectResultado(origin, estado === "aprobada" ? "ok" : "error");
  } catch (error) {
    console.error("Error en el primer cobro tras inscripción Oneclick", error);
    return redirectResultado(origin, "error");
  }
}

export async function GET(request: NextRequest) {
  return procesarRetorno(request.nextUrl.origin, request.nextUrl.searchParams.get("TBK_TOKEN"));
}

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectResultado(origin, "error");
  }
  const tbkToken = form.get("TBK_TOKEN");
  return procesarRetorno(origin, typeof tbkToken === "string" ? tbkToken : null);
}
