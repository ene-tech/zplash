"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAppData } from "@/context/AppContext";
import { PASES_INCLUIDOS_X5, PLANES, TICKETS_UPGRADE_PACK, fmtCLP, fmtFecha } from "@/lib/helpers";
import type { useOperadorFoundResult } from "./useOperadorFoundResult";

// Lo que el operador tiene que contarle al cliente que todavía anda con el
// ilimitado viejo cada vez que se le ofrece pagar el plan: ese plan dejó de
// ofrecerse y cualquier pago lo deja en el X5, así que el cliente no puede
// enterarse del tope después de haber pagado. Se muestra solo si el plan
// guardado no es el que se vende hoy.
function AvisoPasaAX5({ plan, precioAdicional }: { plan: string | null | undefined; precioAdicional: number }) {
  if (!plan || plan === PLANES[0]) return null;
  return (
    <div style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
      <b>Cuéntale:</b> su {plan} deja de ofrecerse y al pagar queda en el {PLANES[0]} —{" "}
      {PASES_INCLUIDOS_X5} lavados Full Túnel en el mes (uno cada 24 horas, con aspirado incluido después de cada uno)
      y, si necesita más, el lavado adicional a {fmtCLP(precioAdicional)}. Renovando antes de que se le venza mantiene
      su precio.
    </div>
  );
}

/** El descuento dicho en plata o en porcentaje, según cómo se emitió. */
function fmtDescuento(cupon: { esPorcentaje?: boolean; valor: number }): string {
  return cupon.esPorcentaje ? `${cupon.valor}%` : fmtCLP(cupon.valor);
}

type Props = Pick<
  ReturnType<typeof useOperadorFoundResult>,
  | "c"
  | "citaDetailingPendiente"
  | "registrarDetailing"
  | "lavadoWebPendiente"
  | "registrarLavadoWeb"
  | "ticketsPatente"
  | "usarTicket"
  | "showOffer"
  | "pNormal"
  | "showRenovacionSoloWeb"
  | "pPromoWeb"
  | "cuponDescuentoVigente"
  | "cuponDescuentoSoloWeb"
  | "precioPlanWeb"
  | "precioAdicional"
  | "planVigente"
  | "estadoIngreso"
  | "precioLavadoUnicoFinal"
  | "registrarPagado"
  | "cobrarLavadoUnico"
  | "precioPromo2"
  | "precioPromo5"
  | "cobrarPromoLavados"
  | "upgradePack"
  | "cobrarUpgradePack"
  | "precioQrTarjeta"
  | "perfilId"
>;

// Las distintas "ofertas" que el Operador puede ver sobre un cliente
// encontrado (descuento solo-web, túnel pendiente, promociones de plan,
// lavados): cada una es independiente entre sí y se muestra según su propia
// condición calculada en useOperadorFoundResult.
//
// El Plan X5 se vende solo por la web (oct-2026): el mesón no cobra planes —
// ni contratar, ni renovar, ni reactivar, ni pagos atrasados. Lo que hace es mostrar el QR para que el cliente lo
// pague con su tarjeta en el celular, y contarle las promociones de la web.
export default function OperadorFoundOfertas(props: Props) {
  const { c } = props;
  const { guardando } = useAppData();
  // Tickets que esta patente canjea sin código (ver ticketsVigentesDePatente),
  // el que vence antes primero. El `?? []` es para los tests, que montan el
  // componente con las props justas de cada tarjeta.
  const tickets = props.ticketsPatente ?? [];
  // Sin plan vigente se le ofrecen las opciones del mesón (QR del plan,
  // lavados).
  const sinPlan = props.planVigente === false;
  // El QR también al que tiene el plan vigente y lo paga en el mesón
  // (showOffer excluye al que ya paga por la web): inscribiendo la tarjeta, el
  // primer cobro llega recién a su vencimiento (ver inscripcion/retorno).
  const qr = (sinPlan || props.showOffer) && props.precioQrTarjeta ? props.precioQrTarjeta : undefined;
  const sinIngreso = props.planVigente && (props.estadoIngreso === "sin_pases" || props.estadoIngreso === "bloqueado");
  const esLavado = (el: ReactNode) => ["lavado", "lavado-extra"].includes((el as ReactElement).key as string);
  return (
    <div className="ofertas-operador">
      {/* Ingresos ya pagados: no son venta, van antes que las opciones. */}
      {tickets.length > 0 && (
        <div className="offer-card">
          <div className="offer-head">
            <h4>{tickets.length === 1 ? "Tiene 1 lavado pagado" : `Tiene ${tickets.length} lavados pagados`}</h4>
          </div>
          <div className="msg">
            {c.nombre} tiene {tickets.length === 1 ? "un ticket" : `${tickets.length} tickets`} de &quot;{tickets[0].nombreLote}
            &quot; para esta patente{tickets.length > 1 ? "; el más próximo" : ", que"} vence el{" "}
            {new Date(tickets[0].fechaCaducidad).toLocaleDateString("es-CL")}. Úsalo para dejarlo entrar — no genera un
            cobro nuevo, ya se pagó.
          </div>
          <button className="btn secondary" onClick={() => props.usarTicket(tickets[0])} disabled={guardando}>
            Usar 1 ticket e ingresar
          </button>
        </div>
      )}
      {props.citaDetailingPendiente && (
        <div className="offer-card">
          <div className="offer-head">
            <h4>Pasada por el túnel pendiente</h4>
          </div>
          <div className="msg">
            {c.nombre} tiene un servicio vendido en Servicios Adicionales que incluye pasada por el túnel.
            Regístralo para dejarlo entrar — esto no genera una venta nueva, la venta ya está hecha.
          </div>
          <button className="btn secondary" onClick={props.registrarDetailing}>
            Registrar ingreso — Servicio de Detailing
          </button>
        </div>
      )}
      {props.lavadoWebPendiente && (
        <div className="offer-card">
          <div className="offer-head">
            <h4>Lavado pagado online, pendiente de canjear</h4>
          </div>
          <div className="msg">
            {c.nombre} ya pagó un Lavado único ({fmtCLP(props.lavadoWebPendiente.precio)}) desde la web. Regístralo
            para dejarlo entrar — esto no genera un cobro nuevo, ya se pagó.
          </div>
          <button className="btn secondary" onClick={props.registrarLavadoWeb}>
            Registrar ingreso — Lavado pagado online
          </button>
        </div>
      )}
      {/* El lavado único de hoy (o de hace poco) se completa a Promo 4
          lavados: va antes que la lista porque es la oferta del momento. */}
      {props.upgradePack && (
        <div className="offer-card">
          <div className="offer-head">
            <h4>Completar Promo 4 lavados</h4>
          </div>
          <div className="msg">
            {c.nombre} pagó un lavado único el {fmtFecha(props.upgradePack.lavado.fecha)}. Con {fmtCLP(props.upgradePack.precio)}{" "}
            más se lleva {TICKETS_UPGRADE_PACK} lavados para esta patente, a usar en 30 días desde ese lavado.
          </div>
          <div className="price-row">
            <span className="new">+{fmtCLP(props.upgradePack.precio)}</span>
          </div>
          <button className="btn secondary" onClick={() => props.cobrarUpgradePack(props.upgradePack!)} disabled={guardando}>
            Cobrar {TICKETS_UPGRADE_PACK} lavados más (+{fmtCLP(props.upgradePack.precio)})
          </button>
        </div>
      )}
      {/* Todo lo que se le puede vender, en una sola lista (ver
          .opciones-venta en globals.css) para recorrerla con el cliente. */}
      <div className="opciones-venta">
        <div className="opciones-venta-head">Opciones para ofrecerle a {c.nombre || "el cliente"}</div>
        {/* Con la tarjeta del QR a la vista no hace falta: ese link es la
            misma web, con la patente puesta y el descuento ya restado. */}
        {props.cuponDescuentoSoloWeb && !qr && (
          <div className="offer-card">
            <div className="offer-head">
              <h4>Promoción especial contratando por la web</h4>
            </div>
            <div className="msg">
              Cuéntaselo antes de cobrarle: {c.nombre} tiene {fmtDescuento(props.cuponDescuentoSoloWeb)} de descuento{" "}
              <b>solo si contrata por la web</b> — acá no se puede aplicar. Entrando a su cuenta en la web con su patente{" "}
              <span className="plate-tag">{c.patente}</span> el descuento ya le sale restado del precio, sin necesidad de
              código. Válido hasta el {new Date(props.cuponDescuentoSoloWeb.fechaCaducidad).toLocaleDateString("es-CL")}.
            </div>
            {!!props.precioPlanWeb && (
              <div className="price-row">
                <span className="new">{fmtCLP(props.precioPlanWeb)}</span>
                <span className="save">total pagando por la web</span>
              </div>
            )}
          </div>
        )}
        {props.cuponDescuentoVigente && (
          <div className="offer-card">
            <div className="offer-head">
              <h4>Descuento vigente para este vehículo</h4>
            </div>
            <div className="msg">
              {c.nombre} tiene un descuento de {fmtDescuento(props.cuponDescuentoVigente)} en el Lavado Full Túnel, válido
              hasta el{" "}
              {new Date(props.cuponDescuentoVigente.fechaCaducidad).toLocaleDateString("es-CL")}. Ya está
              restado en los precios de esta pantalla y se gasta con el primer cobro, sin necesidad de código.
            </div>
          </div>
        )}
        {(
        [
        [props.pPromoWeb, props.showRenovacionSoloWeb && (
          <div key="renovar-web" className="offer-card">
            <div className="offer-head">
              <h4>Renovación anticipada solo online</h4>
            </div>
            <div className="msg">
              {c.nombre} puede renovar su {c.plan} antes de que venza a un precio preferencial disponible{" "}
              <b>solo online</b> — no se puede cobrar acá. Menciónaselo: entrando a su cuenta en la web con su patente lo
              renueva al tiro a ese precio, sin perder los días que le quedan.
            </div>
            <AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} />
            <div className="price-row">
              <span className="old">{fmtCLP(props.pNormal)}</span>
              <span className="new">{fmtCLP(props.pPromoWeb!)}</span>
              <span className="save">solo por la web</span>
            </div>
          </div>
        )],
        [qr?.primerCobro, qr && (
          <QrPlanConTarjeta
            key="qr"
            patente={c.patente}
            precio={qr}
            perfilId={props.perfilId}
            vence={props.planVigente ? c.vencimiento : undefined}
            aviso={<AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} />}
          />
        )],
        [props.precioLavadoUnicoFinal, sinPlan && (
          <div key="lavado" className="offer-card">
            <div className="offer-head">
              <h4>Lavado Full Túnel</h4>
            </div>
            <div className="msg">Un lavado, sin plan.</div>
            <div className="price-row">
              <span className="new">{fmtCLP(props.precioLavadoUnicoFinal)}</span>
            </div>
            <button className="btn secondary" onClick={props.registrarPagado} disabled={guardando}>
              Cobrar Lavado Full Túnel ({fmtCLP(props.precioLavadoUnicoFinal)})
            </button>
          </div>
        )],
        [props.precioPromo2, sinPlan && props.precioPromo2 > 0 && (
          <div key="promo2" className="offer-card">
            <div className="offer-head">
              <h4>Promo 2 lavados</h4>
            </div>
            <div className="msg">Pasa ahora y le queda 1 lavado para después.</div>
            <div className="price-row">
              <span className="new">{fmtCLP(props.precioPromo2)}</span>
            </div>
            <button className="btn secondary" onClick={() => props.cobrarPromoLavados("promo_2_lavados")} disabled={guardando}>
              Cobrar Promo 2 lavados ({fmtCLP(props.precioPromo2)})
            </button>
          </div>
        )],
        [props.precioPromo5, sinPlan && props.precioPromo5 > 0 && (
          <div key="promo5" className="offer-card">
            <div className="offer-head">
              <h4>Promo 4 lavados</h4>
            </div>
            <div className="msg">Pasa ahora y le quedan 3 lavados para los próximos 30 días. Sin plan ni renovación.</div>
            <div className="price-row">
              <span className="new">{fmtCLP(props.precioPromo5)}</span>
            </div>
            <button className="btn secondary" onClick={() => props.cobrarPromoLavados("promo_5_lavados")} disabled={guardando}>
              Cobrar Promo 4 lavados ({fmtCLP(props.precioPromo5)})
            </button>
          </div>
        )],
        [props.precioLavadoUnicoFinal, sinIngreso && (
          <div key="lavado-extra" className="offer-card">
            <div className="offer-head">
              <h4>{props.estadoIngreso === "sin_pases" ? "Lavado adicional" : "Lavado aparte del plan"}</h4>
            </div>
            <div className="msg">Hoy no puede entrar con su plan (ver la ficha abajo). Puede pagar un lavado e ingresar igual.</div>
            <div className="price-row">
              <span className="new">{fmtCLP(props.precioLavadoUnicoFinal)}</span>
            </div>
            <button className="btn secondary" onClick={props.cobrarLavadoUnico} disabled={guardando}>
              Comprar lavado por {fmtCLP(props.precioLavadoUnicoFinal)} e ingresar
            </button>
          </div>
        )],
        ] as [number | undefined, ReactNode][]
        )
          .filter(([, el]) => el)
          // El lavado suelto va primero; todo lo demás son promociones, de
          // menor a mayor precio, bajo su propio título.
          .sort(([a, x], [b, y]) => Number(esLavado(y)) - Number(esLavado(x)) || (a ?? 0) - (b ?? 0))
          .flatMap(([, el], i, todas) =>
            esLavado(el) && i < todas.length - 1
              ? [
                  el,
                  <div key="vip" className="titulo-vip">
                    Promociones exclusivas cliente VIP
                    <span>{c.nombre}</span>
                  </div>,
                ]
              : [el]
          )}
      </div>
    </div>
  );
}

// Oneclick exige que el titular tipee la tarjeta en Transbank: el mesón no la
// puede inscribir por él. Lo más cerca es que el cliente escanee esto y pague
// el plan en su celular, parado acá — es el mismo link del bot de WhatsApp
// (ver lib/whatsapp/router.ts), con la patente ya puesta, y deja la
// renovación automática andando.
//
// Es la única forma de vender el plan en el local: el mesón no lo cobra (ver
// OperadorFoundOfertas). También la usa la patente no registrada (ver
// OperadorNotFoundResult). Con `vence` (plan vigente) la tarjeta queda
// inscrita y el primer cobro llega recién ese día (ver inscripcion/retorno).
export function QrPlanConTarjeta({
  patente,
  precio,
  perfilId,
  vence,
  aviso,
}: {
  patente: string;
  precio: { primerCobro: number; mensual: number };
  perfilId?: string;
  vence?: string | null;
  aviso?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const conPromo = precio.primerCobro !== precio.mensual;
  const monto = `${fmtCLP(precio.primerCobro)}${conPromo ? " el primer mes" : "/mes"}`;
  // op = quién mostró el QR, para atribuirle la venta (ver operadorQr en
  // /api/pagos/oneclick/inscribir, que lo valida contra los perfiles).
  // Dominio público, no window.location.origin: el operador corre en
  // admin.zplash.cl y esta página la abre el cliente.
  const url =
    `https://zplash.cl/pagar?item=plan&patente=${encodeURIComponent(patente)}` +
    (perfilId ? `&op=${encodeURIComponent(perfilId)}` : "") +
    // Origen para PostHog: escaneado en el mesón, no un link de WhatsApp.
    "&utm_source=local&utm_medium=qr&utm_campaign=pago_tarjeta";
  return (
    <div className="offer-card">
      <div className="offer-head">
        <h4>{PLANES[0]} con cobro automático desde su celular</h4>
      </div>
      <div className="msg">
        {conPromo && <>Desde el próximo mes, {fmtCLP(precio.mensual)}/mes automático. </>}
        Que el cliente escanee el QR con la cámara, ponga su correo y pague con su tarjeta. <b>El plan no se cobra
        acá</b>, solo por la web:{" "}
        {vence ? (
          <>
            su plan sigue igual y desde el {fmtFecha(vence)} se le renueva solo cada mes.
          </>
        ) : (
          <>el plan queda pagado y se le renueva solo cada mes.</>
        )}
      </div>
      {aviso}
      <div className="price-row">
        <span className="new">{monto}</span>
      </div>
      {abierto && (
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div
            style={{
              background: "#fff",
              padding: 12,
              borderRadius: 8,
              display: "inline-block",
            }}
          >
            <QRCodeSVG value={url} size={200} />
          </div>
        </div>
      )}
      <button className="btn secondary" onClick={() => setAbierto(!abierto)}>
        {abierto ? "Cerrar QR" : "Mostrar QR para pagar con tarjeta"}
      </button>
    </div>
  );
}
