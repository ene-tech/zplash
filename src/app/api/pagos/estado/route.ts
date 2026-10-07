import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { isValidPatente, normPlate, planStatus, requiereValidacionX5 } from "@/lib/helpers";
import { buscarClientePorPatente } from "@/lib/dataAccess/clientes";
import { cotizarPlanWeb } from "@/lib/pagos";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 30;
const VENTANA_MS = 5 * 60 * 1000;

// Endpoint público (sin sesión) para que un cliente consulte el estado de su
// plan antes de pagar en /pagar. Devuelve solo lo no sensible — nunca email,
// teléfono ni rut — porque cualquiera puede llamarlo con cualquier patente.
export async function GET(request: NextRequest) {
  try {
    if (await rateLimited(`pagos-estado:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
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
    const { precioBase, precioFinal, precioAutoMensual, primerCobroAuto, vencido, yaUsoTicket } = await cotizarPlanWeb(cliente, db);

    return NextResponse.json({
      encontrado: true,
      // Solo el nombre de pila: con la patente (pintada en el auto) cualquiera
      // consulta esto, y el nombre completo era el dato que faltaba para cruzar
      // patente → persona.
      nombre: cliente.nombre?.trim().split(/\s+/)[0] ?? "",
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
      // Lo que cobra el PRIMER cobro de la renovación automática cuando sale
      // más barato que el mensual: por la promoción de reactivación y/o por el
      // cupón de descuento de la patente. undefined = paga el precio de
      // siempre. Los meses siguientes los cobra el cron a ese precio normal
      // (el cupón es de un uso y se quema en este cobro). Con el cupón ya
      // restado porque cobrarOfertaOneclick y cobrarSuscripcion también lo
      // restan al cobrar — si no, la pantalla anunciaría un monto distinto
      // del que llega a Transbank.
      // > 0 porque cobrarSuscripcion/cobrarOfertaOneclick no pueden cobrar $0:
      // si el descuento cubriera el plan entero, ahí se cobra el de lista.
      precioPrimerCobroAuto: primerCobroAuto !== precioAutoMensual && primerCobroAuto > 0 ? primerCobroAuto : undefined,
      // El lavado full túnel gratis por inscribir la tarjeta con el plan
      // vencido sigue disponible para esta patente (es una sola vez por
      // cliente, ver otorgarTicketReactivacion).
      ticketReactivacion: vencido && !yaUsoTicket,
      // true = este cliente sigue en el ilimitado viejo y todavía no acepta
      // pasar al X5, así que el botón tiene que decirle que lo que contrata es
      // el Plan X5 y no "renovar su plan" (ver AvisoPasaAX5). Se resuelve acá
      // con el helper y no en la pantalla para que no tenga que adivinar cuál
      // es el plan legacy.
      requiereValidacionX5: requiereValidacionX5(cliente),
    });
  } catch (error) {
    console.error("Error en /api/pagos/estado", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
