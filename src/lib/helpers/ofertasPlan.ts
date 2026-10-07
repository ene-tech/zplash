import type { CanalPromo, Cliente, ConfigGlobal, Cupon, Ingreso, Precios, Venta } from "@/types";
import { precioConCupon } from "./cupones";
import { IDS_PROMOS_LAVADOS, PLANES, PROMOS_LAVADOS, precioPromoLavados, type IdPromoLavados } from "./precios";
import { diasVencido, planStatus } from "./clientes";
import { visitasPeriodoPlan, visitasUltimoPeriodoVencido } from "./ingresos";
import {
  precioConHeredado,
  precioLavadoUnicoWeb,
  precioPlanOneclick,
  precioRenovacionATiempo,
  precioPagoAtrasado,
  precioRenovacionLocal,
  precioReactivacionVencido,
  precioUpgradePack,
  TICKETS_UPGRADE_PACK,
  tramoRenovacionVigente,
  ventaUpgradeElegible,
} from "./precios";

export interface OfertaPlan {
  renovacionAnticipada?: { pNormal: number; pPromo: number; ahorro: number; diasRestantes?: number; tramoVigente: boolean };
  // `pNormal` = lo que va a pagar DESPUÉS: la promoción de reactivación es
  // solo por ese primer mes, y la renovación siguiente vale lo que cuesta
  // renovar a tiempo (ver precioRenovacionATiempo: el preferencial del plan,
  // no el de lista). Va acá porque en un cliente vencido
  // `renovacionAnticipada` no existe y es el único lugar donde el cliente Web
  // puede ver ese valor.
  // `visitas` = pasadas del último período pagado (visitasUltimoPeriodoVencido),
  // el mismo eje con que el tramo eligió el precio. Va acá porque el correo de
  // "Plan vencido" se lo dice al cliente ({{pasadas}}, ver @/lib/mailing/reglas/cron)
  // y sería absurdo recontarlo con otra consulta teniéndolo ya calculado.
  reactivacion?: { precio: number; diasVencido: number; pNormal: number; visitas: number };
  // Upgrade a Promo 4 Lavados (ver UPGRADE_PACK_KEY): pagó un lavado único
  // hace poco y sigue sin plan vigente. No es una oferta de plan —no toca
  // plan ni vencimiento, son tickets— pero va acá porque nace de la misma
  // venta y sale en la misma tarjeta de Mi Cuenta. `vence` es el de los
  // tickets: un mes desde ese lavado.
  upgradePack?: { precio: number; tickets: number; vence: string };
  // Plan vencido SIN tramo de reactivación que le calce: no es una promoción,
  // es el plan de siempre esperando que lo paguen. Existe para que un cliente
  // vencido nunca se quede sin botón de pago en Mi Cuenta — antes, pasada la
  // ventana de reactivación, la tarjeta del vehículo no le ofrecía nada y su
  // única salida era volver a /pagar y reingresar la patente a mano.
  //
  // Se cobra como `renovacion` (mismo tipo público y mismo precio que /pagar,
  // de ahí precioPlanCliente: con pocos días de atraso conserva su precio de
  // contratación, pasado el plazo paga el vigente), no como una promo de
  // cuenta. Pagarlo no reinicia el ciclo: aplicarPagoAprobado ancla el
  // vencimiento a fechaContratacion (ver vencimientoAnclado), así que el
  // cliente recupera SU plan con los días de atraso ya perdidos. Salvo el
  // ilimitado viejo, que contrata el X5 de cero desde hoy (ver ilimitadoVencido).
  pagoVencido?: { precio: number; diasVencido: number; visitas: number };
  // Cliente de la categoría "Sin plan" (`vencimiento` nulo, ver planStatus):
  // nunca contrató, así que no le calza ninguna de las de arriba —todas nacen
  // de un plan vigente o vencido— y su tarjeta en Mi Cuenta quedaba sin un
  // solo botón para comprar, incluso mostrándole el cupón de descuento de su
  // patente "ya aplicado en los precios de abajo" con nada abajo.
  //
  // No es una promoción: es el precio de siempre de entrar al plan por web.
  // `primerCobro` es lo que cobra la inscripción de tarjeta (ver
  // cobrarSuscripcion: precioPlanOneclick con el cupón de la patente restado,
  // el mismo número que anuncia /pagar) y `mensual` lo que cobra el cron
  // desde el mes siguiente, cuando el cupón ya se quemó. `lavadoUnico` es la
  // alternativa sin compromiso de la misma tarjeta — va acá, y no por una vía
  // de datos aparte, porque es la otra mitad de esa única decisión que se le
  // ofrece a quien todavía no es cliente de plan. `packs` son los tickets
  // de 2 y 4 lavados de la escalera de /tickets, por la misma razón: un pack
  // en $0 está apagado y no viene. Sin cupón (ver ofertaConCupon).
  contratacion?: {
    primerCobro: number;
    mensual: number;
    lavadoUnico: number;
    packs: { id: IdPromoLavados; lavados: number; precio: number }[];
  };
}

/**
 * La misma oferta con el cupón de descuento de la patente ya restado de todo
 * lo cobrable. Solo para MOSTRAR (las tarjetas de Mi Cuenta, que anuncian el
 * precio y disparan el cobro con el mismo número): los caminos que cobran
 * —/api/pagos/webpay/crear y cobrarOfertaOneclick— vuelven a aplicar el
 * descuento sobre el precio base por su cuenta, así que jamás hay que
 * alimentarlos con una oferta que ya pasó por acá o el cupón se restaría dos
 * veces.
 *
 * `pNormal` no se toca a propósito: es el precio de referencia de "antes", no
 * algo que se cobre. `ahorro` sí se recalcula, para que la tarjeta no siga
 * anunciando un ahorro menor que el real.
 */
export function ofertaConCupon(oferta: OfertaPlan, cupon: Pick<Cupon, "valor" | "esPorcentaje"> | undefined): OfertaPlan {
  if (!cupon) return oferta;
  const o: OfertaPlan = { ...oferta };
  if (o.renovacionAnticipada) {
    const pPromo = precioConCupon(o.renovacionAnticipada.pPromo, cupon);
    o.renovacionAnticipada = { ...o.renovacionAnticipada, pPromo, ahorro: o.renovacionAnticipada.pNormal - pPromo };
  }
  if (o.reactivacion) o.reactivacion = { ...o.reactivacion, precio: precioConCupon(o.reactivacion.precio, cupon) };
  // upgradePack no: como los packs de lavados, ya es una promoción y el cupón
  // no se le resta (ver /api/pagos/webpay/crear).
  if (o.pagoVencido) o.pagoVencido = { ...o.pagoVencido, precio: precioConCupon(o.pagoVencido.precio, cupon) };
  // El cupón es de un solo uso: rebaja el primer cobro del plan O el lavado
  // suelto (lo que el cliente elija pagar primero lo quema — ver
  // /api/pagos/webpay/crear y cobrarSuscripcion). `mensual` sigue siendo el
  // precio de lista: cuando el cron cobre el mes 2, el cupón ya no existe.
  if (o.contratacion)
    o.contratacion = {
      ...o.contratacion,
      primerCobro: precioConCupon(o.contratacion.primerCobro, cupon),
      lavadoUnico: precioConCupon(o.contratacion.lavadoUnico, cupon),
    };
  return o;
}

/**
 * La promoción que cobra el PRIMER cobro al inscribir la tarjeta sin plan
 * vigente (ver /api/pagos/oneclick/inscripcion/retorno) y que /pagar anuncia
 * antes de mandar al cliente a Transbank (ver /api/pagos/estado): las dos
 * salen de acá o la pantalla promete un precio y Transbank cobra otro.
 * `undefined` = sin promoción, paga el precio de siempre de la renovación
 * automática (cobrarSuscripcion).
 *
 * `reactivacion` es de un cliente SIN plan vigente: los dos llamadores se
 * abren con `st.cls === "bad"`. La renovación anticipada NO
 * entra acá a propósito: con el plan vigente el primer cobro de la inscripción
 * es el de la renovación automática de siempre, que es justamente lo que
 * /pagar anuncia.
 */
export function promoPrimerCobroOneclick(oferta: OfertaPlan): { tipo: "reactivacion"; monto: number } | undefined {
  if (oferta.reactivacion) return { tipo: "reactivacion", monto: oferta.reactivacion.precio };
  return undefined;
}

/**
 * Las mismas 3 promociones de plan que el módulo Operador le ofrece a un
 * cliente presencial (ver OperadorFoundOfertas/useOperadorFoundResult),
 * calculadas como función pura para poder reusarlas tanto al armar la
 * respuesta de Mi Cuenta (qué mostrar) como al crear el cobro en
 * /api/pagos/webpay/crear (qué cobrar realmente) — ahí se vuelve a llamar
 * con datos frescos, nunca se confía en la oferta que el cliente vio en
 * pantalla.
 *
 * A diferencia de `showOffer` en useOperadorFoundResult, acá NO se excluye
 * por `cliente.origen === "WEB"`: esa exclusión existía solo para no
 * duplicarle al Operador una oferta que el cliente Web ya podía ver en
 * /pagar — este es justamente el lugar donde se le ofrece.
 *
 * `canal` es el canal por el que se van a tomar las promociones de renovación
 * anticipada y de reactivación (ver precioRenovacionLocal /
 * precioReactivacionVencido). Por defecto "WEB", que es lo que son todos los
 * llamadores de hoy: Mi Cuenta, /api/pagos/webpay/crear, cobrar-oferta y las
 * reglas de correo de plan vencido — el correo enlaza al pago online, así que
 * un tramo marcado "LOCAL" no se anuncia por ahí.
 */
export function calcularOfertasPlan(
  cliente: Pick<Cliente, "id" | "plan" | "vencimiento" | "fechaContratacion" | "precioPlanHeredado">,
  ventasCliente: Venta[],
  ingresosCliente: Ingreso[],
  config: ConfigGlobal,
  precios: Precios,
  canal: CanalPromo = "WEB"
): OfertaPlan {
  const plan = cliente.plan || PLANES[0];
  const st = planStatus(cliente);
  const oferta: OfertaPlan = {};

  // Renovación anticipada: igual que el Operador, el plan puede renovarse
  // cuando quiera mientras no esté vencido — renovarPlan ancla la nueva
  // vigencia al vencimiento actual si todavía no pasó, así que renovar
  // temprano no le hace perder días.
  //
  // Sin tramo que le calce por canal + pasadas del período vigente no hay
  // promoción por tramo y el precio es el de renovar a tiempo (ahorro 0): la oferta igual
  // se arma, para que Mi Cuenta pueda mostrar su recordatorio de vencimiento y
  // cobrar la renovación (ver sinOfertaReal en VehiculoCard).
  if (st.cls !== "bad") {
    // El precio heredado se aplica sobre AMBOS (ver precioConHeredado): quien
    // venía pagando menos renueva a ese valor, y la tarjeta no le inventa un
    // "ahorro" contra un precio de lista que a él nunca le tocó.
    const pNormal = precioRenovacionATiempo(precios, plan, cliente);
    if (pNormal > 0) {
      const visitasPeriodo = visitasPeriodoPlan(ingresosCliente, cliente);
      const pPromo = precioConHeredado(precioRenovacionLocal(config, precios, plan, visitasPeriodo, canal) ?? pNormal, cliente);
      oferta.renovacionAnticipada = {
        pNormal,
        pPromo,
        ahorro: pNormal - pPromo,
        diasRestantes: st.diasRestantes,
        tramoVigente: tramoRenovacionVigente(config, plan, visitasPeriodo, canal),
      };
    }
  }

  // Reactivación: plan vencido hace poco, con un tramo que calce por días
  // vencido + visitas del último período vigente y que esté habilitado para
  // este canal.
  const diasVenc = diasVencido(cliente);
  if (diasVenc !== null) {
    const visitasUltPeriodo = visitasUltimoPeriodoVencido(ingresosCliente, cliente);
    const precioReactivacion = precioReactivacionVencido(config, plan, diasVenc, visitasUltPeriodo, canal);
    if (precioReactivacion !== undefined) {
      // pNormal con el heredado aplicado: es lo que se le va a cobrar de
      // verdad en la renovación siguiente (ver el bloque de arriba), no el
      // precio de lista.
      oferta.reactivacion = {
        precio: precioReactivacion,
        diasVencido: diasVenc,
        pNormal: precioRenovacionATiempo(precios, plan, cliente),
        visitas: visitasUltPeriodo,
      };
    } else {
      // Sin tramo que le calce el plan igual se puede pagar, al precio normal
      // (ver pagoVencido). La promoción de reactivación, cuando existe, ya es
      // este mismo pago más barato: no se ofrecen las dos juntas.
      //
      // Dentro de los días de gracia de pago atrasado paga lo mismo que si
      // hubiera renovado a tiempo (ver precioPagoAtrasado: el preferencial del
      // plan, con su heredado si tiene); pasado el plazo, el precio normal.
      // `visitas` igual que en reactivacion (ya está contado acá arriba): el
      // correo de plan vencido cae en esta oferta cuando no hay tramo cargado
      // (ver calcularPrecioReactivacion en @/lib/mailing/reglas/cron), y sin el
      // dato su filtro de condicionPasadasMax dejaba pasar a todos.
      const precio = precioPagoAtrasado(precios, plan, cliente, config.diasGraciaPagoAtrasado);
      if (precio > 0) oferta.pagoVencido = { precio, diasVencido: diasVenc, visitas: visitasUltPeriodo };
    }
  }

  // Upgrade a Promo 4 Lavados: compró un "Lavado único" hace poco (ventana
  // ConfigGlobal.horasVentanaUpgradePlan) y sigue sin plan vigente, el mismo
  // público al que el mesón le ofrece los packs. Precio fijo, no depende de
  // lo que pagó por el lavado; $0 = apagado.
  if (st.cls === "bad") {
    const lavado = ventaUpgradeElegible(ventasCliente, cliente.id, config.horasVentanaUpgradePlan);
    const precio = precioUpgradePack(precios);
    if (lavado && precio > 0) {
      const vence = new Date(new Date(lavado.fecha).getTime() + PROMOS_LAVADOS.promo_5_lavados.dias * 86400000).toISOString();
      oferta.upgradePack = { precio, tickets: TICKETS_UPGRADE_PACK, vence };
    }
  }

  // Nunca tuvo plan: se le ofrece contratarlo (o un lavado suelto).
  if (!cliente.vencimiento) {
    // El precio de la renovación automática, que es la única forma de contratar
    // el plan por web (ver ResultadoBusqueda en /pagar): el cupón de la patente
    // lo resta después ofertaConCupon, igual que en el resto de las ofertas.
    const mensual = precioConHeredado(precioPlanOneclick(precios), cliente);
    const packs = IDS_PROMOS_LAVADOS.map((id) => ({ id, lavados: PROMOS_LAVADOS[id].lavados, precio: precioPromoLavados(precios, id) })).filter(
      (p) => p.precio > 0
    );
    if (mensual > 0) oferta.contratacion = { primerCobro: mensual, mensual, lavadoUnico: precioLavadoUnicoWeb(precios), packs };
  }

  return oferta;
}
