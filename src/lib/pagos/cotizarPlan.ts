import { getDb, type DbOrTx } from "@/db";
import { precios } from "@/db/schema";
import {
  PLANES,
  diasVencido,
  planStatus,
  precioConCupon,
  precioConHeredado,
  precioPlanOneclick,
  precioRenovacionCliente,
  promoPrimerCobroOneclick,
} from "@/lib/helpers";
import { getConfig } from "@/lib/dataAccess/config";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { preciosFromRows } from "@/lib/dataAccess/precios";
import type { Cliente } from "@/types";
import { buscarCuponDescuentoPlan } from "./cuponPlan";
import { yaTieneTicketReactivacion } from "./ticketReactivacion";

/**
 * Lo que /pagar le anuncia a esta patente: renovar por Webpay y el primer
 * cobro de la renovación automática, los dos con el cupón restado. Vive acá y
 * no dentro de /api/pagos/estado porque el agente de WhatsApp
 * (@/lib/whatsapp/agente) tiene que citar exactamente el mismo número que va a
 * ver el cliente al abrir el link — si cada uno lo calculara por su lado,
 * volvería el "en el link sale 19.990 y no 17.990".
 */
export async function cotizarPlanWeb(cliente: Cliente, db: DbOrTx = getDb()) {
  const patente = cliente.patente;
  const [config, filasPrecios, cupon] = await Promise.all([
    getConfig(),
    db.select().from(precios),
    buscarCuponDescuentoPlan(patente, db),
  ]);
  // preciosFromRows y no un Object.fromEntries a mano: es el mismo armado
  // que usa calcularOfertasPlanDeCliente, al que ahora se le pasa este mapa
  // para que no vuelva a leer `precios` (ver más abajo).
  const preciosMap = preciosFromRows(filasPrecios);
  // Cupón de descuento de la patente: se resta acá porque /api/pagos/webpay/
  // crear también lo resta al cobrar — si esta pantalla siguiera anunciando
  // el precio sin descuento, volvería a pasar justo lo que el comentario de
  // abajo trata de evitar, un monto distinto del que termina cobrando Webpay.
  // Solo se manda el monto rebajado, nunca el código: este endpoint es
  // público y se consulta con cualquier patente.
  const precioBase = precioRenovacionCliente(preciosMap, cliente.plan || PLANES[0], cliente, config.diasGraciaPagoAtrasado);
  const precioFinal = precioConCupon(precioBase, cupon);

  // Plan no vigente: las dos cosas que cambian la oferta de renovación
  // automática de /pagar — la promoción que le calza (lo que le va a cobrar
  // la inscripción de tarjeta, ver /api/pagos/oneclick/inscripcion/retorno) y
  // si todavía le queda el ticket de lavado gratis que regala inscribirla
  // estando vencido. Solo para los que no tienen plan al día: calcular la
  // oferta cuesta cuatro consultas más y este endpoint es público, un cliente
  // vigente no las necesita.
  //
  // Cada una con su propio filtro: la oferta para todo plan no vigente
  // (planStatus "bad", la misma condición con que la arma calcularOfertasPlan)
  // y el ticket solo para el vencido: preguntarlo para todos los "Sin plan"
  // era una consulta más en un endpoint público para un dato que después se
  // descarta.
  const vencido = diasVencido(cliente) !== null;
  const [oferta, yaUsoTicket] = await Promise.all([
    // `config` y `preciosMap` ya están leídos acá arriba: pasárselos le ahorra
    // dos consultas de las cuatro que cuesta la oferta, en un endpoint público.
    planStatus(cliente).cls === "bad" ? calcularOfertasPlanDeCliente(cliente, { config, precios: preciosMap }) : undefined,
    vencido ? yaTieneTicketReactivacion(patente, (cliente.email || "").trim().toLowerCase()) : true,
  ]);
  // La promoción que va a cobrar la inscripción de tarjeta, resuelta con el
  // mismo helper que usa el cobro (ver promoPrimerCobroOneclick).
  const promoAuto = oferta ? promoPrimerCobroOneclick(oferta) : undefined;
  // Precio mensual de la renovación automática (Oneclick): no pasa por el
  // plazo de atraso, solo respeta el heredado — mismo cálculo que hace
  // cobrarSuscripcion al cobrar el ciclo.
  const precioAutoMensual = precioConHeredado(precioPlanOneclick(preciosMap), cliente);
  // Lo que cobra el PRIMER cobro: la promoción si le calza, si no el mensual,
  // en ambos casos con el cupón restado — los dos caminos que lo cobran
  // (cobrarOfertaOneclick y cobrarSuscripcion) aplican el cupón, y como es de
  // un uso solo rebaja ese primer mes.
  const primerCobroAuto = precioConCupon(promoAuto?.monto ?? precioAutoMensual, cupon);

  return { precioBase, precioFinal, precioAutoMensual, primerCobroAuto, promoAuto, cupon, vencido, yaUsoTicket };
}
