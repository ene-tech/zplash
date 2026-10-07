import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cobrosOneclick, suscripcionesOneclick, ventas } from "@/db/schema";
import {
  conservaTarjetaAlReinscribir,
  diasVencido,
  esInscripcionSoloTarjeta,
  MARCA_SOLO_TARJETA,
  planStatus,
  promoPrimerCobroOneclick,
} from "@/lib/helpers";
import { buscarClientePorPatente, registrarAceptacionPoliticas } from "@/lib/dataAccess/clientes";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { cobrarOfertaOneclick, cobrarSuscripcion, migrarDeWooCommerceLegacy, otorgarTicketReactivacion } from "@/lib/pagos";
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
  // Dos formas del mismo token: la re-inscripción de una tarjeta que ya cobra
  // lo guarda con MARCA_SOLO_TARJETA pegada cuando viene de "Mis tarjetas"
  // (ver /api/pagos/oneclick/inscribir); Transbank siempre devuelve el pelado.
  const [suscripcion] = await db
    .select()
    .from(suscripcionesOneclick)
    .where(inArray(suscripcionesOneclick.tokenInscripcion, [tbkToken, tbkToken + MARCA_SOLO_TARJETA]))
    .limit(1);
  if (!suscripcion) {
    console.error("Suscripción Oneclick no encontrada para token", tbkToken);
    return redirectResultado(origin, "error");
  }

  // "pendiente_solo_tarjeta" = inscripción disparada desde "Mis tarjetas" en
  // Mi Cuenta (ver /api/pagos/oneclick/inscribir): a diferencia del flujo de
  // /pagar, acá el cliente solo quiere guardar la tarjeta, no pagar un ciclo
  // ahora — más abajo no se llama a cobrarSuscripcion() para ese caso.
  const esSoloTarjeta = esInscripcionSoloTarjeta(suscripcion.estado, suscripcion.tokenInscripcion);
  // Re-inscripción sobre una tarjeta que ya cobra: la fila sigue "activa" (o
  // suspendida/pausada) a propósito, así que el estado no sirve para saber si
  // hay algo en vuelo — el token con el que la encontramos ya lo dice.
  const conservaTarjeta = conservaTarjetaAlReinscribir(suscripcion);
  if (suscripcion.estado !== "pendiente" && !esSoloTarjeta && !conservaTarjeta) {
    // Ya procesado (doble callback): no repetir el cobro inmediato.
    return redirectResultado(origin, suscripcion.estado === "activa" ? "ok" : "anulado");
  }

  // La inscripción falló o el cliente la abandonó. Si la fila ya tenía una
  // tarjeta que cobra, queda como estaba y solo se limpia el token: el par
  // (username, tbkUser) viejo sigue vivo en Transbank —empezar una inscripción
  // no da de baja nada— y cancelarla acá era apagarle la renovación automática
  // al cliente por intentar cambiar de tarjeta.
  async function inscripcionFallida() {
    await db
      .update(suscripcionesOneclick)
      .set({
        estado: conservaTarjeta ? suscripcion.estado : "cancelada",
        tokenInscripcion: null,
        actualizadoEn: new Date().toISOString(),
      })
      .where(eq(suscripcionesOneclick.id, suscripcion.id));
  }

  let resultado: { response_code: number; tbk_user?: string; authorization_code?: string; card_type?: string; card_number?: string };
  try {
    resultado = await oneclickInscription().finish(tbkToken);
  } catch (error) {
    console.error("Error confirmando inscripción Oneclick", error);
    await inscripcionFallida();
    return redirectResultado(origin, esSoloTarjeta ? "tarjeta_error" : "error");
  }

  if (resultado.response_code !== 0 || !resultado.tbk_user) {
    await inscripcionFallida();
    return redirectResultado(origin, esSoloTarjeta ? "tarjeta_anulada" : "anulado");
  }

  // Consentimiento del cliente del ilimitado viejo: la pantalla le mostró el
  // aviso (AvisoPasaAX5) y el botón que apretó decía "Contratar Plan X5", no
  // "renovar tu plan". Sin esta marca, cobrarSuscripcion no le cobra ni el
  // primer cargo de la inscripción (ver requiereValidacionX5), así que se graba
  // antes de leer la ficha y de cobrar, acá y no en /inscribir: ese endpoint es
  // público y con la patente sola cualquiera daba el sí en nombre del cliente.
  // Llegar a este punto, en cambio, exige una inscripción que Transbank ya
  // confirmó. `isNull` no pisa una aceptación anterior: la fecha del primer sí
  // es la que sirve de prueba.
  //
  // "Solo tarjeta" queda fuera: ese flujo es "Mis tarjetas", guardar un medio
  // de pago sin contratar nada. Ahí el cliente nunca vio el aviso ni apretó un
  // botón que dijera Plan X5, así que no aceptó nada.
  if (!esSoloTarjeta) {
    await db
      .update(clientes)
      .set({ aceptoX5En: new Date().toISOString() })
      .where(and(eq(clientes.patente, suscripcion.patente), isNull(clientes.aceptoX5En)));
    // Mismo motivo: /pagar no deja inscribir sin marcar la casilla de
    // políticas, y acá se registra recién con la tarjeta ya confirmada.
    if (suscripcion.email) await registrarAceptacionPoliticas(suscripcion.email);
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
    // Cambiar de tarjeta no reagenda el ciclo: la fila que ya venía cobrando se
    // queda con SU proximoCobro (puede estar atrasado a propósito, con el cron
    // reintentando; pisarlo con null era otra forma de apagarle la renovación
    // automática al cliente). Solo se completa si no tenía fecha.
    //
    // Y tampoco la despierta: la que estaba "suspendida" (baja hecha por el
    // admin) o pausada por el candado del X5 conserva su estado. Promoverla a
    // "activa" con esa fecha atrasada le cobraba un ciclo entero al día
    // siguiente, en la pantalla que promete "No se hace ningún cobro ahora".
    const proximoCobro = conservaTarjeta ? suscripcion.proximoCobro || vencimientoFuturo : vencimientoFuturo;

    await db
      .update(suscripcionesOneclick)
      .set({
        // username junto con tbkUser: start() se llamó con la patente, y si
        // esta fila venía compartiendo la tarjeta de otro auto (ver
        // compartir-tarjeta) el par tiene que quedar consistente — authorize()
        // exige el mismo username con el que se inscribió ese tbkUser.
        username: suscripcion.patente,
        tbkUser: resultado.tbk_user,
        cardTipo: resultado.card_type || null,
        cardUltimosDigitos: resultado.card_number || null,
        estado: conservaTarjeta ? suscripcion.estado : "activa",
        proximoCobro,
        tokenInscripcion: null,
        actualizadoEn: new Date().toISOString(),
      })
      .where(eq(suscripcionesOneclick.id, suscripcion.id));

    migrarDeWooCommerceLegacy(cliente, suscripcion.patente);
    return redirectResultado(origin, "tarjeta_guardada");
  }

  const activada = {
    ...suscripcion,
    // Ver el comentario del username en la rama de arriba: el cobro que sigue
    // usa este objeto, así que el par (username, tbkUser) tiene que ir junto.
    username: suscripcion.patente,
    tbkUser: resultado.tbk_user,
    estado: "activa" as const,
    proximoCobro: new Date().toISOString(),
  };
  await db
    .update(suscripcionesOneclick)
    .set({
      username: suscripcion.patente,
      tbkUser: resultado.tbk_user,
      cardTipo: resultado.card_type || null,
      cardUltimosDigitos: resultado.card_number || null,
      estado: "activa",
      proximoCobro: activada.proximoCobro,
      tokenInscripcion: null,
      actualizadoEn: new Date().toISOString(),
    })
    .where(eq(suscripcionesOneclick.id, suscripcion.id));

  migrarDeWooCommerceLegacy(cliente, suscripcion.patente);

  // ¿El plan venía vencido? Se mira ANTES de cobrar, porque el cobro de acá
  // abajo es justamente lo que lo reactiva (ver aplicarPagoAprobado).
  const veniaVencido = !!cliente && diasVencido(cliente) !== null;
  // Promoción que le calza a esta patente (ver promoPrimerCobroOneclick): el
  // cliente que llega sin plan vigente e inscribe su tarjeta entra pagando ese
  // precio y no el de lista de la renovación automática — es la misma oferta
  // que Mi Cuenta cobra vía cobrarOfertaOneclick y la que /pagar le anunció
  // antes de mandarlo a Transbank (ver /api/pagos/estado). Se recalcula acá con
  // datos frescos, nunca se confía en lo que el cliente vio en pantalla. Es
  // solo por este primer cobro: los meses siguientes los cobra el cron al
  // precio normal de la renovación automática.
  const promo = cliente && planStatus(cliente).cls === "bad" ? promoPrimerCobroOneclick(await calcularOfertasPlanDeCliente(cliente)) : undefined;

  // Tarjeta inscrita: cobra ya mismo en vez de esperar al cron del día
  // siguiente, para que el plan quede activo de inmediato.
  try {
    const { estado } = promo
      ? await cobrarOfertaOneclick(suscripcion.patente, promo.tipo, promo.monto)
      : await cobrarSuscripcion(activada);
    if (estado === "aprobada" && suscripcion.operadorQr) {
      // Venta que acaba de dejar este primer cobro: se le anota el operador
      // del QR para el ranking de ventas. Aparte y sin frenar nada, igual que
      // el ticket de abajo: el cargo ya está hecho.
      try {
        const [cobro] = await db
          .select({ ventaId: cobrosOneclick.ventaId })
          .from(cobrosOneclick)
          .where(and(eq(cobrosOneclick.suscripcionId, suscripcion.id), eq(cobrosOneclick.estado, "aprobada")))
          .orderBy(desc(cobrosOneclick.creadoEn))
          .limit(1);
        if (cobro?.ventaId) {
          await db.update(ventas).set({ operadorQr: suscripcion.operadorQr }).where(eq(ventas.id, cobro.ventaId));
        }
      } catch (error) {
        console.error("No se pudo atribuir la venta al operador del QR", suscripcion.patente, error);
      }
    }
    if (estado === "aprobada" && veniaVencido) {
      // Promo: registrar tarjeta de pago automático teniendo el plan vencido
      // deja 1 ticket de lavado full túnel gratis, para cualquier vehículo,
      // vigente DIAS_TICKET_REACTIVACION días, y un correo con el código —una sola vez por
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
