import { NextRequest, NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, suscripcionesOneclick } from "@/db/schema";
import { diasVencido, planStatus, promoPrimerCobroOneclick } from "@/lib/helpers";
import { buscarClientePorPatente } from "@/lib/dataAccess/clientes";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { cancelarSuscripcionWooCommerceLegacy, cobrarOfertaOneclick, cobrarSuscripcion, otorgarTicketReactivacion } from "@/lib/pagos";
import { oneclickInscription } from "@/lib/transbank";
import type { Cliente } from "@/types";

// Si la patente que acaba de activar su tarjeta Oneclick propia todavía
// tiene marca de renovación automática por WooCommerce (ver
// renovacionAutoWooDesde en @/db/schema/clientes), dispara la cancelación de
// esa suscripción vieja — si no, WooCommerce le sigue cobrando su próximo
// ciclo con la tarjeta anterior al mismo tiempo que el cron nuevo cobra con
// la tarjeta recién inscrita (doble cobro real). Se llama después de que la
// suscripción Oneclick ya quedó "activa" en la base, con after() para no
// retrasar la respuesta al cliente — ver cancelarSuscripcionWooCommerceLegacy
// para el detalle de por qué es best-effort.
function dispararMigracionLegacySiCorresponde(
  db: ReturnType<typeof getDb>,
  cliente: Pick<Cliente, "id" | "email" | "renovacionAutoWooDesde"> | null,
  patente: string
) {
  if (!cliente?.renovacionAutoWooDesde) return;
  after(() =>
    cancelarSuscripcionWooCommerceLegacy(patente, cliente.email || "")
      .then(async ({ cancelada, subscriptionId }) => {
        if (!cancelada) return;
        console.log(`Suscripción WooCommerce #${subscriptionId} cancelada tras migrar ${patente} a Oneclick propio`);
        await db.update(clientes).set({ renovacionAutoWooDesde: null }).where(eq(clientes.id, cliente.id));
      })
      .catch((error) => console.error("Error cancelando suscripción WooCommerce tras migración de tarjeta", patente, error))
  );
}

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

  // Ficha completa (no un subset de columnas): más abajo se le calcula la
  // promoción de reactivación, que necesita plan/fechaContratacion/heredado.
  const cliente = await buscarClientePorPatente(suscripcion.patente);

  if (esSoloTarjeta) {
    // Sin cobro inmediato: si la patente tiene un plan vigente, el próximo
    // cobro automático queda agendado justo para su vencimiento real (nunca
    // antes, para no duplicar lo que el cliente ya pagó por otro medio). Si
    // no tiene plan vigente, la tarjeta queda guardada pero sin fecha de
    // cobro — el cron (que solo mira proximoCobro <= ahora) la deja en paz
    // hasta que el cliente contrate/renueve y quede con un vencimiento real.
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

    dispararMigracionLegacySiCorresponde(db, cliente, suscripcion.patente);
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

  dispararMigracionLegacySiCorresponde(db, cliente, suscripcion.patente);

  // ¿El plan venía vencido? Se mira ANTES de cobrar, porque el cobro de acá
  // abajo es justamente lo que lo reactiva (ver aplicarPagoAprobado).
  const veniaVencido = !!cliente && diasVencido(cliente) !== null;
  // Sin plan vigente = vencido O nunca contratado. Es la MISMA condición con
  // la que calcularOfertasPlan arma el upgrade (`st.cls === "bad"`), y por eso
  // manda acá en vez de `veniaVencido`: el cliente de lavado único que nunca
  // tuvo plan tiene `vencimiento` null, así que diasVencido() le devuelve null
  // y quedaba fuera. Con eso, apretar "Upgrade a plan (+$X)" en Mi Cuenta sin
  // tarjeta guardada lo mandaba a inscribir una y este retorno le cobraba el
  // precio completo de la renovación automática vía cobrarSuscripcion, no el
  // adicional que la pantalla le prometió — y su plan quedaba anclado a hoy en
  // vez de a la fecha del lavado (ver aplicarUpgradePlan).
  const sinPlanVigente = !!cliente && planStatus(cliente).cls === "bad";

  // Promoción que le calza a esta patente (ver promoPrimerCobroOneclick): el
  // cliente que llega sin plan vigente e inscribe su tarjeta entra pagando ese
  // precio y no el de lista de la renovación automática — es la misma oferta
  // que Mi Cuenta cobra vía cobrarOfertaOneclick y la que /pagar le anunció
  // antes de mandarlo a Transbank (ver /api/pagos/estado). Se recalcula acá con
  // datos frescos, nunca se confía en lo que el cliente vio en pantalla. Es
  // solo por este primer cobro: los meses siguientes los cobra el cron al
  // precio normal de la renovación automática.
  const promo = sinPlanVigente && cliente ? promoPrimerCobroOneclick(await calcularOfertasPlanDeCliente(cliente)) : undefined;

  // Tarjeta inscrita: cobra ya mismo en vez de esperar al cron del día
  // siguiente, para que el plan quede activo de inmediato.
  try {
    const { estado } = promo
      ? await cobrarOfertaOneclick(suscripcion.patente, promo.tipo, promo.monto)
      : await cobrarSuscripcion(activada);
    if (estado === "aprobada" && veniaVencido) {
      // Promo: registrar tarjeta de pago automático teniendo el plan vencido
      // deja 1 ticket de lavado full túnel gratis, para cualquier vehículo,
      // vigente hasta el cierre de la campaña (ver FIN_PROMO_TICKET; después
      // vuelve a ser a 30 días) y un correo con el código —una sola vez por
      // cliente, ver otorgarTicketReactivacion, que devuelve null si ya la
      // usó. Fuera de la transacción del cobro (cobrarSuscripcion abre la
      // suya): el cargo ya está hecho, y no emitir el ticket nunca puede
      // costarle el plan al cliente, por eso se registra el error y se sigue.
      try {
        await otorgarTicketReactivacion({
          patente: suscripcion.patente,
          email: suscripcion.email,
          creadoPor: "Promo reactivación (Oneclick)",
        });
      } catch (error) {
        console.error("No se pudo emitir el ticket de la promo de reactivación", suscripcion.patente, error);
      }
    }
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
