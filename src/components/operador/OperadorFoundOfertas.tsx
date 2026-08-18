"use client";

import { PLANES, fmtCLP, fmtHorasVentanaUpgradePlan } from "@/lib/helpers";
import type { useOperadorFoundResult } from "./useOperadorFoundResult";

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
  | "precioOfertaWeb"
  | "renovarWeb"
  | "ventaUpgrade"
  | "horasVentanaUpgrade"
  | "precioUpgrade"
  | "upgradeAPlan"
  | "cuponDescuentoVigente"
>;

// Las distintas "ofertas" que el Operador puede ver sobre un cliente
// encontrado (túnel pendiente, renovación, reactivación, upgrade, cupón
// WhatsApp): cada una es independiente entre sí y se muestra según su propia
// condición calculada en useOperadorFoundResult.
export default function OperadorFoundOfertas(props: Props) {
  const { c } = props;
  return (
    <>
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
              <div className="price-row">
                <span className="old">{fmtCLP(props.pNormal)}</span>
                <span className="new">{fmtCLP(props.pPromo)}</span>
                <span className="save">Ahorra {fmtCLP(props.ahorro)}</span>
              </div>
              <button className="btn secondary" onClick={props.renovar}>
                Renovar plan a precio preferencial
              </button>
            </>
          ) : (
            <>
              <div className="msg">
                {c.nombre} no tiene promoción de renovación vigente (ver Configuración → Precios de planes), pero
                igual puedes renovarle su {c.plan} ahora al precio normal.
              </div>
              <div className="price-row">
                <span className="new">{fmtCLP(props.pNormal)}</span>
              </div>
              <button className="btn secondary" onClick={props.renovar}>
                Renovar plan ({fmtCLP(props.pNormal)})
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
            Ofrécele a {c.nombre} reactivar su {c.plan} ahora mismo a precio preferencial.
          </div>
          <div className="price-row">
            <span className="new">{fmtCLP(props.precioReactivacion!)}</span>
          </div>
          {props.pNormal > 0 && (
            <div style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Aclárale que es solo por este primer mes: la próxima renovación vale {fmtCLP(props.pNormal)} pagándola
              antes del vencimiento.
            </div>
          )}
          <button className="btn secondary" onClick={props.reactivar}>
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
          <div className="price-row">
            {props.pNormal > props.precioAtrasado && <span className="old">{fmtCLP(props.pNormal)}</span>}
            <span className="new">{fmtCLP(props.precioAtrasado)}</span>
          </div>
          <button className="btn secondary" onClick={props.pagarAtrasado}>
            Pagar plan atrasado ({fmtCLP(props.precioAtrasado)})
          </button>
        </div>
      )}
      {props.esWebVencido && !props.showReactivacion && !props.showReactivacionSoloWeb && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Cliente Web</span>
            <h4>No renovó automáticamente</h4>
          </div>
          <div className="msg">
            El pago automático de {c.nombre} falló y su plan quedó vencido. Puedes renovárselo ahora al mismo valor
            de su último pedido.
          </div>
          <div className="price-row">
            <span className="new">{fmtCLP(props.precioOfertaWeb)}</span>
          </div>
          <button className="btn secondary" onClick={props.renovarWeb}>
            Renovar plan Web ({fmtCLP(props.precioOfertaWeb)})
          </button>
        </div>
      )}
      {props.ventaUpgrade && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción</span>
            <h4>¿Lo pasamos a Plan Ilimitado?</h4>
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
            <span className="badge">WhatsApp</span>
            <h4>Descuento vigente para este vehículo</h4>
          </div>
          <div className="msg">
            {c.nombre} tiene un descuento de{" "}
            {props.cuponDescuentoVigente.esPorcentaje
              ? `${props.cuponDescuentoVigente.valor}%`
              : fmtCLP(props.cuponDescuentoVigente.valor)}{" "}
            en el Lavado Full Túnel, válido hasta el{" "}
            {new Date(props.cuponDescuentoVigente.fechaCaducidad).toLocaleDateString("es-CL")}. Se aplica
            automáticamente al cobrar, sin necesidad de código.
          </div>
        </div>
      )}
    </>
  );
}
