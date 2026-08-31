"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { PASES_INCLUIDOS_X5, PLANES, fmtCLP, fmtFecha } from "@/lib/helpers";
import type { OfertaPlan } from "@/lib/helpers";
import type { VehiculoSesion } from "@/lib/sesionCliente";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SolicitudCambioPatente } from "@/components/cliente/miCuenta/SolicitudCambioPatente";
import { QuitarVehiculo } from "@/components/cliente/miCuenta/QuitarVehiculo";
import { EliminarPlan } from "@/components/cliente/miCuenta/EliminarPlan";
import { AvisoPasaAX5 } from "@/components/cliente/AvisoPasaAX5";
import { useOfertaPlan, type TarjetaGuardada, type TipoOfertaPlan } from "@/components/cliente/miCuenta/useOfertaPlan";
import { redirigirAInscripcionOneclick } from "@/lib/webpayClient";

type Accion = "cambio" | "quitar" | "eliminar-plan" | null;

const NOMBRE_OFERTA: Record<TipoOfertaPlan, string> = {
  renovacion_temprana: "Renovación anticipada",
  reactivacion: "Reactivación de plan",
  upgrade_plan: "Upgrade a Plan X5",
  contratacion: "Contratación de plan",
};

// "Tu plan vence en X días/hoy" — compartido entre el banner de oferta real y
// el de recordatorio sin oferta (ver sinOfertaReal más abajo).
function fraseVenceEn(diasRestantes: number): string {
  return "Tu plan vence en " + (diasRestantes <= 0 ? "hoy" : diasRestantes + " día" + (diasRestantes === 1 ? "" : "s"));
}

// Tarjeta de "Mis vehículos" en Mi Cuenta. "Solicitar cambio de patente" y
// "Quitar de mi cuenta" viven en el menú "⋮" de la esquina superior derecha
// (mismo patrón que MobileRowMenu en el panel de operador) en vez de ir como
// botones sueltos — SolicitudCambioPatente/QuitarVehiculo quedan montados
// siempre (así conservan su propio estado de error/envío) y solo se les
// controla la visibilidad vía `abierto`.
export function VehiculoCard({
  v,
  oferta,
  ticketReactivacion,
  lavados,
  tarjeta,
  descuento,
  email,
  onActualizado,
}: {
  v: VehiculoSesion;
  oferta?: OfertaPlan;
  // Le queda el lavado full túnel gratis de la promo de reactivación (una
  // sola vez por cliente, ver otorgarTicketReactivacion).
  ticketReactivacion?: boolean;
  lavados?: { usados: number; incluidos: number; reponeEl: string };
  tarjeta?: TarjetaGuardada;
  // Cupón que el server ya restó de los precios de `oferta` (ver
  // ofertaConCupon): acá solo se anuncia, para que el precio más bajo no se
  // lea como un error.
  descuento?: { codigo: string; beneficio: string };
  email: string;
  onActualizado: () => void;
}) {
  const [accion, setAccion] = useState<Accion>(null);
  const tieneCambioPatente = v.plan !== "Sin plan";
  // Dar de baja el plan solo tiene sentido con el plan ya vencido: vigente, el
  // cliente pagó por esos días (ver /api/cliente/mi-cuenta/eliminar-plan, que
  // valida lo mismo del lado del servidor).
  const puedeEliminarPlan = v.estado.cls === "bad" && !!v.vencimiento;
  const {
    pagando,
    confirmando,
    err: errOferta,
    rechazada,
    pedir,
    cancelarConfirmacion,
    confirmarConTarjeta,
    pagarPlanVencido,
    comprarLavadoUnico,
    // Sin tarjeta inscrita el plan no se puede cobrar: se manda a inscribir
    // una y ese retorno hace el primer cobro con el precio de la promoción
    // (ver promoPrimerCobroOneclick).
  } = useOfertaPlan(v.patente, tarjeta ?? null, onActualizado, () => registrarTarjeta(false));

  const montoOferta = (tipo: TipoOfertaPlan): number | undefined =>
    tipo === "renovacion_temprana"
      ? oferta?.renovacionAnticipada?.pPromo
      : tipo === "reactivacion"
        ? oferta?.reactivacion?.precio
        : tipo === "contratacion"
          ? oferta?.contratacion?.primerCobro
          : oferta?.upgrade?.precio;

  const ra = oferta?.renovacionAnticipada;
  // Sin tramo promocional (ahorro <= 0, o sea la renovación no queda más
  // barata que el precio normal): no hay nada nuevo que ofrecer, así que con
  // tarjeta guardada (se cobra sola) el banner no aporta y se esconde entero
  // — sin tarjeta, se reemplaza por un recordatorio simple invitando a
  // registrar una y renovar antes del vencimiento (ver render más abajo).
  const sinOfertaReal = !!ra && ra.ahorro <= 0;
  // El cupón de la patente ya viene restado del primer cobro (ver
  // ofertaConCupon): solo cuando queda por debajo del mensual hay algo que
  // tachar y que explicar.
  const co = oferta?.contratacion;
  const conDescuento = !!co && co.primerCobro < co.mensual;

  const [inscribiendo, setInscribiendo] = useState(false);
  const [errInscripcion, setErrInscripcion] = useState("");
  // Sin tarjeta inscrita los botones de promoción salen a Transbank a
  // inscribir una (es la única forma de pagar el plan), así que hay que
  // decirlo antes de que el cliente apriete, no después.
  const ocupado = pagando !== null || inscribiendo;
  const avisoInscripcion = !tarjeta && (
    <div className="hint" style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
      Se inscribe tu tarjeta para el pago automático mensual y el cobro se hace al instante.
    </div>
  );

  // Mismo endpoint que AgregarTarjeta pero sin el paso de elegir
  // patente/email: acá ya se sabe ambos por contexto. `soloGuardar` decide si
  // la inscripción además cobra al volver: false = está pagando el plan (es
  // la única forma de pagarlo sin tarjeta guardada), true = solo deja la
  // tarjeta lista para el cobro automático del vencimiento.
  async function registrarTarjeta(soloGuardar = true) {
    setErrInscripcion("");
    setInscribiendo(true);
    try {
      const res = await fetch("/api/pagos/oneclick/inscribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente: v.patente, email, soloGuardar }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrInscripcion(data.error || "No se pudo iniciar la inscripción");
        setInscribiendo(false);
        return;
      }
      redirigirAInscripcionOneclick(data.url, data.token);
    } catch {
      setErrInscripcion("Sin conexión. Intenta de nuevo.");
      setInscribiendo(false);
    }
  }

  return (
    <div className="vehicle-card">
      <div className="cabecera">
        <div className="cabecera-id">
          <span className="plate-tag">{v.patente}</span>
          <span className="plan-inline">{v.plan}</span>
        </div>
        <div className="cabecera-acciones">
          <span className={`status-pill ${v.estado.cls}`}>{v.estado.label}</span>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Más acciones" />}>
              <MoreVertical size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {tieneCambioPatente && (
                <DropdownMenuItem onClick={() => setAccion("cambio")}>Solicitar cambio de patente</DropdownMenuItem>
              )}
              {puedeEliminarPlan && (
                <DropdownMenuItem variant="destructive" onClick={() => setAccion("eliminar-plan")}>
                  Eliminar Plan
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onClick={() => setAccion("quitar")}>
                Eliminar esta patente de mi cuenta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {v.vencimiento && <div style={{ color: "var(--gray)", fontSize: 12.5, marginTop: 6 }}>{v.estado.cls === "bad" ? "Venció" : "Vence"} el {fmtFecha(v.vencimiento)}</div>}
      {/* Solo planes con tope (X5): el server manda `lavados` únicamente para
          esos (ver pasesIncluidos). Con el plan vencido el ciclo ya no corre,
          así que el contador confunde más de lo que informa. */}
      {lavados && v.estado.cls !== "bad" && (
        <div style={{ color: "var(--gray)", fontSize: 12.5, marginTop: 4 }}>
          Llevas <strong style={{ color: "var(--white)" }}>{lavados.usados} de {lavados.incluidos}</strong> lavados de este período
          {lavados.usados >= lavados.incluidos ? ` — vuelves a tener ${lavados.incluidos} el ${fmtFecha(lavados.reponeEl)}` : ` (se reponen el ${fmtFecha(lavados.reponeEl)})`}
        </div>
      )}

      {descuento && (
        <div style={{ color: "var(--green)", fontSize: 12.5, marginTop: 6 }}>
          Cupón {descuento.codigo} ({descuento.beneficio}) — ya aplicado en los precios de abajo.
        </div>
      )}

      {oferta && <AvisoPasaAX5 plan={v.plan} vencimiento={v.estado.cls !== "bad" ? v.vencimiento : null} />}

      {ra && !(sinOfertaReal && tarjeta) && (
        <div className="offer-card">
          {sinOfertaReal ? (
            <>
              <div className="offer-head">
                <span className="badge">Recordatorio</span>
                <h4>{ra.diasRestantes === undefined ? "Tu plan está por vencer" : fraseVenceEn(ra.diasRestantes)}</h4>
              </div>
              <div className="msg">
                Registra una tarjeta y renueva tu {PLANES[0]} antes del vencimiento para mantener tu precio de compra ({fmtCLP(ra.pPromo)}).
              </div>
              {errInscripcion && <div className="err">{errInscripcion}</div>}
              <div className="offer-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn secondary" onClick={() => registrarTarjeta()} disabled={inscribiendo}>
                  {inscribiendo ? "Redirigiendo..." : "REGISTRAR TARJETA - PAGO AUTOMÁTICO"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="offer-head">
                <span className="badge">Oferta</span>
                <h4>{ra.diasRestantes === undefined ? "Renovación anticipada disponible" : fraseVenceEn(ra.diasRestantes)}</h4>
              </div>
              <div className="msg">Renueva tu {PLANES[0]} ahora mismo a precio preferencial.</div>
              <div className="price-row">
                <span className="old">{fmtCLP(ra.pNormal)}</span>
                <span className="new">{fmtCLP(ra.pPromo)}</span>
                <span className="save">Ahorras {fmtCLP(ra.ahorro)}</span>
              </div>
              <div className="hint" style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                Renovar ahora suma un mes a la fecha de vencimiento de tu plan actual: no pierdes los días que ya tienes.
              </div>
              {avisoInscripcion}
              <button className="btn secondary" onClick={() => pedir("renovacion_temprana")} disabled={ocupado}>
                {pagando === "renovacion_temprana" ? "Procesando..." : inscribiendo ? "Redirigiendo..." : "Renovar a precio preferencial"}
              </button>
            </>
          )}
        </div>
      )}
      {oferta?.reactivacion && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción</span>
            <h4>
              Tu plan venció hace {oferta.reactivacion.diasVencido} día{oferta.reactivacion.diasVencido === 1 ? "" : "s"}
            </h4>
          </div>
          <div className="msg">Activa tu {PLANES[0]} ahora mismo a precio preferencial.</div>
          <div className="price-row">
            <span className="new">{fmtCLP(oferta.reactivacion.precio)}</span>
          </div>
          {/* Lo emite tanto el cobro contra la tarjeta guardada (cobrar-oferta)
              como el primer cobro de una tarjeta recién inscrita (ver
              /api/pagos/oneclick/inscripcion/retorno), que son los dos únicos
              caminos para reactivar. */}
          {ticketReactivacion && (
            <div className="hint" style={{ color: "var(--green)", fontSize: 13, marginBottom: 12 }}>
              Incluye 1 lavado full túnel gratis por reactivar con tu tarjeta de pago automático, para usar en cualquier patente.
            </div>
          )}
          {oferta.reactivacion.pNormal > 0 && (
            <div className="hint" style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Precio promocional solo por este primer mes. Después tu plan vuelve a {fmtCLP(oferta.reactivacion.pNormal)},
              pagándolo antes del vencimiento.
            </div>
          )}
          {avisoInscripcion}
          <button className="btn secondary" onClick={() => pedir("reactivacion")} disabled={ocupado}>
            {pagando === "reactivacion"
              ? "Procesando..."
              : inscribiendo
                ? "Redirigiendo..."
                : `Reactivar plan (${fmtCLP(oferta.reactivacion.precio)})`}
          </button>
        </div>
      )}
      {oferta?.pagoVencido && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Plan vencido</span>
            <h4>
              Tu plan venció hace {oferta.pagoVencido.diasVencido} día{oferta.pagoVencido.diasVencido === 1 ? "" : "s"}
            </h4>
          </div>
          <div className="msg">Págalo cuando quieras y vuelves a pasar a lavar.</div>
          <div className="price-row">
            <span className="new">{fmtCLP(oferta.pagoVencido.precio)}</span>
          </div>
          <div className="hint" style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            Sigue siendo tu mismo plan, con los días de atraso ya corridos: no arranca un ciclo nuevo desde hoy.
          </div>
          {/* Lo emite /api/pagos/webpay/retorno al aplicar este pago. */}
          {ticketReactivacion && (
            <div className="hint" style={{ color: "var(--green)", fontSize: 13, marginBottom: 12 }}>
              Incluye 1 lavado full túnel gratis, para usar en cualquier patente o regalárselo a quien quieras.
            </div>
          )}
          <button className="btn secondary" onClick={pagarPlanVencido} disabled={pagando !== null}>
            {pagando === "renovacion" ? "Procesando..." : `Pagar mi plan (${fmtCLP(oferta.pagoVencido.precio)})`}
          </button>
        </div>
      )}
      {oferta?.upgrade && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción</span>
            <h4>¿Pasarte al Plan X5?</h4>
          </div>
          <div className="msg">Pagaste un lavado único hace poco. Quédate con el plan pagando solo el adicional.</div>
          <div className="price-row">
            <span className="new">+{fmtCLP(oferta.upgrade.precio)}</span>
          </div>
          {avisoInscripcion}
          <button className="btn secondary" onClick={() => pedir("upgrade_plan")} disabled={ocupado}>
            {pagando === "upgrade_plan"
              ? "Procesando..."
              : inscribiendo
                ? "Redirigiendo..."
                : `Upgrade a plan (+${fmtCLP(oferta.upgrade.precio)})`}
          </button>
        </div>
      )}
      {/* Cliente "Sin plan": nunca contrató, así que ninguna de las tarjetas de
          arriba le aplica (ver OfertaPlan.contratacion). Es la única puerta de
          compra que tiene en Mi Cuenta — sin ella su tarjeta mostraba el cupón
          de descuento y nada más. El plan se contrata inscribiendo la tarjeta,
          igual que en /pagar: es la única forma de pagarlo por web. */}
      {oferta?.contratacion && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Sin plan</span>
            <h4>Contrata tu {PLANES[0]}</h4>
          </div>
          <div className="msg">Son {PASES_INCLUIDOS_X5} pasadas por el túnel al mes, sin filas y sin tocar el auto.</div>
          <div className="price-row">
            {conDescuento && <span className="old">{fmtCLP(oferta.contratacion.mensual)}</span>}
            <span className="new">{fmtCLP(oferta.contratacion.primerCobro)}</span>
          </div>
          {conDescuento && (
            <div className="hint" style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Tu descuento se aplica en este primer mes. Desde el siguiente, {fmtCLP(oferta.contratacion.mensual)}/mes.
            </div>
          )}
          {avisoInscripcion}
          {errInscripcion && <div className="err">{errInscripcion}</div>}
          {/* pedir(), no registrarTarjeta() directo: con tarjeta guardada
              cobra contra ella (confirmación + /cobrar-oferta) y solo manda a
              inscribir cuando no hay ninguna, vía onSinTarjeta — igual que las
              otras ofertas de esta tarjeta. Llamar a registrarTarjeta siempre
              le dejaba la tarjeta activa en "pendiente" al cliente que
              abandonaba Transbank. */}
          <button className="btn secondary" onClick={() => pedir("contratacion")} disabled={ocupado}>
            {inscribiendo ? "Redirigiendo..." : `Contratar plan (${fmtCLP(oferta.contratacion.primerCobro)})`}
          </button>
          {/* Alternativa sin compromiso, por Webpay y sin el cupón (que es del
              plan, ver ofertaConCupon): pagar un lavado suelto para esta misma
              patente sin tener que ir a /pagar a tipearla de nuevo. */}
          <button className="btn ghost" onClick={comprarLavadoUnico} disabled={ocupado}>
            {pagando === "lavado_unico"
              ? "Redirigiendo..."
              : `Solo un lavado full túnel (${fmtCLP(oferta.contratacion.lavadoUnico)})`}
          </button>
        </div>
      )}
      {!confirmando && errOferta && <div className="err">{errOferta}</div>}

      {confirmando && tarjeta && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3>Confirmar cobro</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              Se cobrará <strong>{fmtCLP(montoOferta(confirmando) ?? 0)}</strong> ({NOMBRE_OFERTA[confirmando]}) a tu{" "}
              {tarjeta.cardTipo ? `${tarjeta.cardTipo} ` : "tarjeta "}
              terminada en <strong>{tarjeta.cardUltimosDigitos}</strong>.
            </div>
            {(errOferta || errInscripcion) && <div className="err">{errOferta || errInscripcion}</div>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={cancelarConfirmacion} disabled={pagando !== null}>
                Cancelar
              </button>
              {/* Única salida cuando la tarjeta guardada no pasa: el plan no
                  se cobra por Webpay, así que se inscribe otra —la
                  inscripción reemplaza a la anterior y cobra al volver. */}
              {rechazada && (
                <button type="button" className="btn ghost" onClick={() => registrarTarjeta(false)} disabled={inscribiendo}>
                  {inscribiendo ? "Redirigiendo..." : "Pagar con otra tarjeta"}
                </button>
              )}
              <button type="button" className="btn" onClick={confirmarConTarjeta} disabled={pagando !== null}>
                {pagando !== null ? "Cobrando..." : rechazada ? "Reintentar con esta tarjeta" : "Sí, cobrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tieneCambioPatente && (
        <SolicitudCambioPatente
          patente={v.patente}
          plan={v.plan}
          vencimiento={v.vencimiento}
          patentePendiente={v.patentePendiente}
          patentePendienteDesde={v.patentePendienteDesde}
          abierto={accion === "cambio"}
          onCerrar={() => setAccion(null)}
          onActualizado={onActualizado}
        />
      )}
      {puedeEliminarPlan && (
        <EliminarPlan
          patente={v.patente}
          plan={v.plan}
          abierto={accion === "eliminar-plan"}
          onCerrar={() => setAccion(null)}
          onEliminado={onActualizado}
        />
      )}
      <QuitarVehiculo patente={v.patente} abierto={accion === "quitar"} onCerrar={() => setAccion(null)} onQuitado={onActualizado} />
    </div>
  );
}
