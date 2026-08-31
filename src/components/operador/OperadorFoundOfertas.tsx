"use client";

import { useAppData } from "@/context/AppContext";
import { PASES_INCLUIDOS_X5, PLANES, fmtCLP, fmtHorasVentanaUpgradePlan } from "@/lib/helpers";
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
>;

// Las distintas "ofertas" que el Operador puede ver sobre un cliente
// encontrado (descuento solo-web, túnel pendiente, renovación, reactivación,
// upgrade, descuento cobrable acá): cada una es independiente entre sí y se
// muestra según su propia condición calculada en useOperadorFoundResult.
export default function OperadorFoundOfertas(props: Props) {
  const { c } = props;
  const { guardando } = useAppData();
  return (
    <>
      {props.cuponDescuentoSoloWeb && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Web</span>
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
      {props.citaDetailingPendiente && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Túnel</span>
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
            <span className="badge">Túnel</span>
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
      {props.showOffer && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">{props.hayPromoRenovacion ? "Oferta" : "Recordatorio"}</span>
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
              <button className="btn secondary" onClick={props.renovar} disabled={guardando}>
                Renovar plan a precio preferencial
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
              <button className="btn secondary" onClick={props.renovar} disabled={guardando}>
                Renovar plan ({fmtCLP(props.pPromo)})
              </button>
            </>
          )}
        </div>
      )}
      {props.showRenovacionSoloWeb && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción online</span>
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
      )}
      {props.showReactivacion && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción</span>
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
          <button className="btn secondary" onClick={props.reactivar} disabled={guardando}>
            Reactivar plan a precio preferencial ({fmtCLP(props.precioReactivacion!)})
          </button>
        </div>
      )}
      {props.showReactivacionSoloWeb && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción online</span>
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
      )}
      {props.showPagoAtrasado && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Plan vencido</span>
            <h4>
              Plan vencido hace {props.diasVenc} día{props.diasVenc === 1 ? "" : "s"}
            </h4>
          </div>
          <div className="msg">
            {c.nombre} todavía está dentro del plazo para pagarlo atrasado: se le cobra su {c.plan} al mismo precio que
            si hubiera pagado a tiempo y mantiene su fecha de vencimiento — el ciclo sigue corriendo desde donde
            estaba, no arranca de nuevo hoy.
          </div>
          <AvisoPasaAX5 plan={c.plan} precioAdicional={props.precioAdicional} />
          <div className="price-row">
            {props.pNormal > props.precioAtrasado && <span className="old">{fmtCLP(props.pNormal)}</span>}
            <span className="new">{fmtCLP(props.precioAtrasado)}</span>
          </div>
          <button className="btn secondary" onClick={props.pagarAtrasado} disabled={guardando}>
            Pagar plan atrasado ({fmtCLP(props.precioAtrasado)})
          </button>
        </div>
      )}
      {props.esWebVencido && props.precioAtrasado > 0 && !props.showReactivacion && !props.showReactivacionSoloWeb && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Cliente Web</span>
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
          <button className="btn secondary" onClick={props.renovarWeb} disabled={guardando}>
            Cobrar {PLANES[0]} ({fmtCLP(props.precioAtrasado)})
          </button>
        </div>
      )}
      {props.ventaUpgrade && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción</span>
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
      )}
      {props.cuponDescuentoVigente && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Descuento</span>
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
    </>
  );
}
