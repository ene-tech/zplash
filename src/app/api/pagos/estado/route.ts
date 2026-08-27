import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { precios } from "@/db/schema";
import { PLANES, diasVencido, isValidPatente, normPlate, planStatus, precioConCupon, precioRenovacionCliente } from "@/lib/helpers";
import { buscarClientePorPatente } from "@/lib/dataAccess/clientes";
import { getConfig } from "@/lib/dataAccess/config";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { buscarCuponDescuentoPlan, yaTieneTicketReactivacion } from "@/lib/pagos";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 30;
const VENTANA_MS = 5 * 60 * 1000;

// Endpoint público (sin sesión) para que un cliente consulte el estado de su
// plan antes de pagar en /pagar. Devuelve solo lo no sensible — nunca email,
// teléfono ni rut — porque cualquiera puede llamarlo con cualquier patente.
export async function GET(request: NextRequest) {
  try {
    if (rateLimited(`pagos-estado:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    const patente = normPlate(request.nextUrl.searchParams.get("patente"));
    if (!isValidPatente(patente)) {
      return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
    }

    const db = getDb();
    const cliente = await buscarClientePorPatente(patente);
    if (!cliente) {
      return NextResponse.json({ encontrado: false });
    }
    const [{ diasGraciaPagoAtrasado }, filasPrecios, cupon] = await Promise.all([
      getConfig(),
      db.select().from(precios),
      buscarCuponDescuentoPlan(patente, db),
    ]);
    const preciosMap = Object.fromEntries(filasPrecios.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));
    // Cupón de descuento de la patente: se resta acá porque /api/pagos/webpay/
    // crear también lo resta al cobrar — si esta pantalla siguiera anunciando
    // el precio sin descuento, volvería a pasar justo lo que el comentario de
    // abajo trata de evitar, un monto distinto del que termina cobrando Webpay.
    // Solo se manda el monto rebajado, nunca el código: este endpoint es
    // público y se consulta con cualquier patente.
    const precioBase = precioRenovacionCliente(preciosMap, cliente.plan || PLANES[0], cliente, diasGraciaPagoAtrasado);
    const precioFinal = precioConCupon(precioBase, cupon);

    // Plan vencido: las dos cosas que cambian la oferta de renovación
    // automática de /pagar — la promoción de reactivación que le calza (lo
    // que le va a cobrar la inscripción de tarjeta, ver
    // /api/pagos/oneclick/inscripcion/retorno) y si todavía le queda el
    // ticket de lavado gratis que regala inscribirla estando vencido. Solo
    // para vencidos: calcular la oferta cuesta cuatro consultas más y este
    // endpoint es público, un cliente al día no las necesita.
    const vencido = diasVencido(cliente) !== null;
    const [oferta, yaUsoTicket] = vencido
      ? await Promise.all([calcularOfertasPlanDeCliente(cliente), yaTieneTicketReactivacion(patente, (cliente.email || "").trim().toLowerCase())])
      : [undefined, true];

    return NextResponse.json({
      encontrado: true,
      nombre: cliente.nombre,
      plan: cliente.plan,
      vencimiento: cliente.vencimiento,
      estado: planStatus(cliente),
      // Precio ya resuelto de renovar/pagar el plan de esta patente, con el
      // MISMO helper que cobra /api/pagos/webpay/crear (ver
      // precioRenovacionCliente): heredado si está en plazo, precio de siempre
      // si se atrasó pocos días, precio de lista si se pasó del plazo. Se
      // manda calculado y no en partes (precio de lista + heredado + días de
      // gracia, como estaba antes) justamente para que la pantalla no pueda
      // volver a anunciar un monto distinto del que termina cobrando Webpay.
      precioRenovacion: precioFinal,
      // Cuánto se le está descontando (0 = ningún cupón), para que la pantalla
      // pueda explicar el precio más bajo en vez de que parezca un error.
      descuentoCupon: precioBase - precioFinal,
      // Sigue yendo aparte porque /pagar lo usa para el precio de la
      // renovación automática (Oneclick), que no pasa por el plazo de atraso.
      precioPlanHeredado: cliente.precioPlanHeredado,
      // Lo que cobra el PRIMER cobro de la renovación automática cuando la
      // patente califica para la promoción de reactivación; undefined = paga
      // el precio de siempre de la renovación automática. Los meses
      // siguientes los cobra el cron a ese precio normal. Con el cupón ya
      // restado porque cobrarOfertaOneclick también lo resta al cobrar — si
      // no, la pantalla anunciaría un monto distinto del que llega a
      // Transbank.
      precioPrimerCobroAuto: oferta?.reactivacion ? precioConCupon(oferta.reactivacion.precio, cupon) : undefined,
      // El lavado full túnel gratis por inscribir la tarjeta con el plan
      // vencido sigue disponible para esta patente (es una sola vez por
      // cliente, ver otorgarTicketReactivacion).
      ticketReactivacion: vencido && !yaUsoTicket,
    });
  } catch (error) {
    console.error("Error en /api/pagos/estado", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
