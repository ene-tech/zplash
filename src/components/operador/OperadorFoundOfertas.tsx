"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAppData } from "@/context/AppContext";
import { PASES_INCLUIDOS_X5, PLANES, fmtCLP, fmtHorasVentanaUpgradePlan, ilimitadoVencido, requiereValidacionX5 } from "@/lib/helpers";
import { aceptarPasoAX5 } from "@/lib/serverActions/clientes";
import type { useOperadorFoundResult } from "./useOperadorFoundResult";

// Lo que el operador tiene que contarle al cliente que todavía anda con el
// ilimitado viejo cada vez que se le ofrece pagar el plan: ese plan dejó de
// ofrecerse y cualquier pago lo deja en el X5 (ver renovarPlan en
// @/lib/logic), así que el cliente no puede enterarse del tope después de
// haber pagado. Se muestra solo si el plan guardado no es el que se vende hoy.
function AvisoPasaAX5({
  plan,
  precioAdicional,
  // Las tarjetas "solo online" no cobran acá, así que ahí el aviso es para que
  // se lo mencione, no una instrucción de qué decir antes de pasar la tarjeta.
  lead = "Cuéntale antes de cobrarle:",
}: {
  plan: string | null | undefined;
  precioAdicional: number;
  lead?: string;
}) {
  if (!plan || plan === PLANES[0]) return null;
  return (
    <div style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
      <b>{lead}</b> su {plan} deja de ofrecerse y al pagar queda en el {PLANES[0]} —{" "}
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
  | "st"
  | "pNormal"
  | "pPromo"
  | "ahorro"
  | "hayPromoRenovacion"
  | "showRenovacionSoloWeb"
  | "pPromoWeb"
  | "renovar"
  | "showReactivacion"
  | "diasVenc"
  | "precioReactivacion"
  | "reactivar"
  | "showReactivacionSoloWeb"
  | "precioReactivacionWeb"
  | "showPagoAtrasado"
  | "precioAtrasado"
  | "pagarAtrasado"
  | "esWebVencido"
  | "renovarWeb"
  | "ventaUpgrade"
  | "horasVentanaUpgrade"
  | "precioUpgrade"
  | "upgradeAPlan"
  | "cuponDescuentoVigente"
  | "cuponDescuentoSoloWeb"
  | "precioPlanWeb"
  | "precioAdicional"
  | "planVigente"
  | "estadoIngreso"
  | "pContratacion"
  | "contratarPlan"
  | "precioLavadoUnicoFinal"
  | "registrarPagado"
  | "cobrarLavadoUnico"
  | "precioPromo2"
  | "precioPromo5"
  | "cobrarPromoLavados"
  | "precioQrTarjeta"
  | "perfilId"
>;

// Las distintas "ofertas" que el Operador puede ver sobre un cliente
// encontrado (descuento solo-web, túnel pendiente, renovación, reactivación,
// upgrade, descuento cobrable acá): cada una es independiente entre sí y se
// muestra según su propia condición calculada en useOperadorFoundResult.
export default function OperadorFoundOfertas(props: Props) {
  const { c } = props;
  const { guardando } = useAppData();
  // El cliente que sigue en el ilimitado viejo no se pasa solo al X5: se pasa
  // cuando alguien aprieta un botón que dice "Contratar Plan X5" con el aviso
  // a la vista. Ese click es la aceptación, y se registra ANTES de cobrar
  // porque es lo que destraba el cobro (ver requiereValidacionX5) y lo que
  // reactiva su renovación automática si el cron la había pausado.
  const legacy = requiereValidacionX5(c);
  const conAceptacion = (accion: () => void) => async () => {
    if (legacy && !(await aceptarPasoAX5(c.id))) return;
    accion();
  };
  // Al cliente legacy los botones no le pueden decir "renovar su plan": lo que
  // se le está vendiendo es otro producto.
  const rotulo = (normal: string) => (legacy ? `Contratar ${PLANES[0]}` : normal);
  // Tickets que esta patente canjea sin código (ver ticketsVigentesDePatente),
  // el que vence antes primero. El `?? []` es para los tests, que montan el
  // componente con las props justas de cada tarjeta.
  const tickets = props.ticketsPatente ?? [];
  // Sin plan vigente se le ofrecen las opciones del mesón (plan nuevo, QR,
  // lavados). Con la venta de upgrade a mano el "plan nuevo" sería el mismo
  // botón que la tarjeta de upgrade (contratarPlan delega en upgradeAPlan).
  const sinPlan = props.planVigente === false;
  const sinIngreso = props.planVigente && (props.estadoIngreso === "sin_pases" || props.estadoIngreso === "bloqueado");
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
      {/* Todo lo que se le puede vender, en una sola lista (ver
          .opciones-venta en globals.css) para recorrerla con el cliente. */}
      <div className="opciones-venta">
        <div className="opciones-venta-head">Opciones para ofrecerle a {c.nombre || "el cliente"}</div>
        {props.cuponDescuentoSoloWeb && (
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
              {c.nombre} tiene un descuento de {fmtDescuento(props.cuponDescuentoVigente)} en el Lavado Full Túnel o en
              cualquier plan, válido hasta el{" "}
              {new Date(props.cuponDescuentoVigente.fechaCaducidad).toLocaleDateString("es-CL")}. Ya está
              restado en los precios de esta pantalla y se gasta con el primer cobro, sin necesidad de código.
            </div>
          </div>
        )}
        {/* Lo que se cobra, ordenado de menor a mayor precio. */}
        {(
        [
        [props.pPromo, props.showOffer && (
          <div key="renovar" className="offer-card">
            <div className="offer-head">
              <h4>
                {props.st.diasRestantes === undefined
                  ? "Renovación anticipada disponible"
                  : "Plan por vencer en " +
                    (props.st.diasRestantes <= 0
                      ? "hoy"
                      : props.st.diasRestantes + " día" + (props.st.diasRestantes === 1 ? "" : "s"))}
              </h4>
            </div>
            {props.hayPromoRenovacion ? (
              <>
                <div className="msg">
                  Ofrécele a {c.nombre} renovar su {c.plan} ahora mismo a precio preferencial.
                </div>
                <AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} />
                <div className="price-row">
                  <span className="old">{fmtCLP(props.pNormal)}</span>
                  <span className="new">{fmtCLP(props.pPromo)}</span>
                  <span className="save">Ahorra {fmtCLP(props.ahorro)}</span>
                </div>
                <button className="btn secondary" onClick={conAceptacion(props.renovar)} disabled={guardando}>
                  {rotulo("Renovar plan")} a precio preferencial
                </button>
              </>
            ) : (
              <>
                <div className="msg">
                  {c.nombre} no tiene promoción de renovación vigente (ver Configuración → Precios de planes), pero
                  igual puedes renovarle su {c.plan} ahora al precio normal.
                </div>
                <AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} />
                {/* pPromo, no pNormal: `renovar` cobra pPromo (ver
                    usePlanActions), que acá NO es igual a pNormal — trae el
                    cupón de descuento aplicado, y si el admin dejó un tramo por
                    encima del preferencial el ahorro sale negativo y también cae
                    en esta rama. Pintar pNormal anunciaba un precio y cobraba
                    otro. */}
                <div className="price-row">
                  <span className="new">{fmtCLP(props.pPromo)}</span>
                </div>
                <button className="btn secondary" onClick={conAceptacion(props.renovar)} disabled={guardando}>
                  {rotulo("Renovar plan")} ({fmtCLP(props.pPromo)})
                </button>
              </>
            )}
          </div>
        )],
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
            <AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} lead="Cuéntale:" />
            <div className="price-row">
              <span className="old">{fmtCLP(props.pNormal)}</span>
              <span className="new">{fmtCLP(props.pPromoWeb!)}</span>
              <span className="save">solo por la web</span>
            </div>
          </div>
        )],
        [props.precioReactivacion, props.showReactivacion && (
          <div key="reactivar" className="offer-card">
            <div className="offer-head">
              <h4>
                Plan vencido hace {props.diasVenc} día{props.diasVenc === 1 ? "" : "s"}
              </h4>
            </div>
            <div className="msg">
              Ofrécele a {c.nombre} activar el {PLANES[0]} ahora mismo a precio preferencial.
            </div>
            <AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} />
            <div className="price-row">
              <span className="new">{fmtCLP(props.precioReactivacion!)}</span>
            </div>
            {props.pNormal > 0 && (
              <div style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                Aclárale que es solo por este primer mes: la próxima renovación vale {fmtCLP(props.pNormal)} pagándola
                antes del vencimiento.
              </div>
            )}
            <button className="btn secondary" onClick={conAceptacion(props.reactivar)} disabled={guardando}>
              {rotulo("Reactivar plan")} a precio preferencial ({fmtCLP(props.precioReactivacion!)})
            </button>
          </div>
        )],
        [props.precioReactivacionWeb, props.showReactivacionSoloWeb && (
          <div key="reactivar-web" className="offer-card">
            <div className="offer-head">
              <h4>
                Plan vencido hace {props.diasVenc} día{props.diasVenc === 1 ? "" : "s"}
              </h4>
            </div>
            <div className="msg">
              {c.nombre} tiene una promoción para reactivar su {c.plan} disponible <b>solo online</b> — no se puede cobrar
              acá. Menciónasela: entrando a su cuenta en la web con su patente puede reactivarlo al tiro a ese precio, solo
              por este primer mes
              {props.pNormal > 0 && <> — después su renovación vale {fmtCLP(props.pNormal)} pagándola antes del vencimiento</>}.
            </div>
            <AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} lead="Cuéntale:" />
            <div className="price-row">
              <span className="new">{fmtCLP(props.precioReactivacionWeb!)}</span>
              <span className="save">solo por la web</span>
            </div>
          </div>
        )],
        [props.precioAtrasado, props.showPagoAtrasado && (
          <div key="atrasado" className="offer-card">
            <div className="offer-head">
              <h4>
                Plan vencido hace {props.diasVenc} día{props.diasVenc === 1 ? "" : "s"}
              </h4>
            </div>
            {ilimitadoVencido(c) ? (
              <div className="msg">
                {c.nombre} venía del {c.plan}, que no se renueva atrasado: se le cobra el {PLANES[0]} como plan nuevo, al
                mismo precio que si hubiera pagado a tiempo, y su ciclo arranca de nuevo hoy.
              </div>
            ) : (
              <div className="msg">
                {c.nombre} todavía está dentro del plazo para pagarlo atrasado: se le cobra su {c.plan} al mismo precio que
                si hubiera pagado a tiempo y mantiene su fecha de vencimiento — el ciclo sigue corriendo desde donde
                estaba, no arranca de nuevo hoy.
              </div>
            )}
            <AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} />
            <div className="price-row">
              {props.pNormal > props.precioAtrasado && <span className="old">{fmtCLP(props.pNormal)}</span>}
              <span className="new">{fmtCLP(props.precioAtrasado)}</span>
            </div>
            <button className="btn secondary" onClick={conAceptacion(props.pagarAtrasado)} disabled={guardando}>
              {rotulo("Pagar plan atrasado")} ({fmtCLP(props.precioAtrasado)})
            </button>
          </div>
        )],
        [props.precioAtrasado, props.esWebVencido && props.precioAtrasado > 0 && !props.showReactivacion && !props.showReactivacionSoloWeb && (
          <div key="web-vencido" className="offer-card">
            <div className="offer-head">
              <h4>No renovó automáticamente</h4>
            </div>
            <div className="msg">
              El pago automático de {c.nombre} falló y su plan quedó vencido. Puedes cobrarle el {PLANES[0]} acá mismo,
              al mismo precio que le sale pagándolo por la web.
            </div>
            <AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} />
            <div className="price-row">
              <span className="new">{fmtCLP(props.precioAtrasado)}</span>
            </div>
            <button className="btn secondary" onClick={conAceptacion(props.renovarWeb)} disabled={guardando}>
              Cobrar {PLANES[0]} ({fmtCLP(props.precioAtrasado)})
            </button>
          </div>
        )],
        [props.precioUpgrade, props.ventaUpgrade && (
          <div key="upgrade" className="offer-card">
            <div className="offer-head">
              <h4>¿Lo pasamos al Plan X5?</h4>
            </div>
            <div className="msg">
              {c.nombre} pagó un lavado único hace menos de {fmtHorasVentanaUpgradePlan(props.horasVentanaUpgrade)}. Ofrécele
              quedar con el {PLANES[0]} este primer mes pagando solo el adicional.
            </div>
            <div className="price-row">
              <span className="new">+{fmtCLP(props.precioUpgrade)}</span>
            </div>
            <button className="btn secondary" onClick={props.upgradeAPlan}>
              Upgrade a {PLANES[0]} (+{fmtCLP(props.precioUpgrade)})
            </button>
          </div>
        )],
        [props.pContratacion, sinPlan && !props.ventaUpgrade && (
          <div key="contratar" className="offer-card">
            <div className="offer-head">
              <h4>Contratar {PLANES[0]}</h4>
            </div>
            <div className="msg">Plan nuevo pagado acá, en el mesón.</div>
            <div className="price-row">
              <span className="new">{fmtCLP(props.pContratacion)}</span>
            </div>
            <button className="btn secondary" onClick={() => props.contratarPlan()} disabled={guardando}>
              Contratar plan nuevo ({fmtCLP(props.pContratacion)})
            </button>
          </div>
        )],
        [props.precioQrTarjeta?.primerCobro, sinPlan && props.precioQrTarjeta && (
          <QrPlanConTarjeta key="qr" patente={c.patente} precio={props.precioQrTarjeta} perfilId={props.perfilId} />
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
          .sort(([a], [b]) => (a ?? 0) - (b ?? 0))
          // Lo que viene después del lavado suelto son las promociones.
          .flatMap(([, el], i, todas) =>
            (el as ReactElement).key === "lavado" && i < todas.length - 1
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
function QrPlanConTarjeta({
  patente,
  precio,
  perfilId,
}: {
  patente: string;
  precio: { primerCobro: number; mensual: number };
  perfilId?: string;
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
        Que el cliente escanee el QR con la cámara, ponga su correo y pague con su tarjeta. <b>No le cobres acá</b>: el
        plan queda pagado y se le renueva solo cada mes.
      </div>
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
