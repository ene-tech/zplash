"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { fmtCLP, fmtFecha } from "@/lib/helpers";
import type { OfertaPlan } from "@/lib/helpers";
import type { VehiculoSesion } from "@/lib/sesionCliente";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SolicitudCambioPatente } from "@/components/cliente/miCuenta/SolicitudCambioPatente";
import { QuitarVehiculo } from "@/components/cliente/miCuenta/QuitarVehiculo";
import { EliminarPlan } from "@/components/cliente/miCuenta/EliminarPlan";
import { useOfertaPlan, type TarjetaGuardada, type TipoOfertaPlan } from "@/components/cliente/miCuenta/useOfertaPlan";
import { redirigirAInscripcionOneclick } from "@/lib/webpayClient";

type Accion = "cambio" | "quitar" | "eliminar-plan" | null;

const NOMBRE_OFERTA: Record<TipoOfertaPlan, string> = {
  renovacion_temprana: "Renovación anticipada",
  reactivacion: "Reactivación de plan",
  upgrade_plan: "Upgrade a Plan X5",
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
  lavados,
  tarjeta,
  email,
  onActualizado,
}: {
  v: VehiculoSesion;
  oferta?: OfertaPlan;
  lavados?: { usados: number; incluidos: number; reponeEl: string };
  tarjeta?: TarjetaGuardada;
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
    pagarPorWebpayEnCambio,
    pagarPlanVencido,
  } = useOfertaPlan(v.patente, tarjeta ?? null, onActualizado);

  const montoOferta = (tipo: TipoOfertaPlan): number | undefined =>
    tipo === "renovacion_temprana" ? oferta?.renovacionAnticipada?.pPromo : tipo === "reactivacion" ? oferta?.reactivacion?.precio : oferta?.upgrade?.precio;

  const ra = oferta?.renovacionAnticipada;
  // Sin tramo promocional (ahorro <= 0, o sea la renovación no queda más
  // barata que el precio normal): no hay nada nuevo que ofrecer, así que con
  // tarjeta guardada (se cobra sola) el banner no aporta y se esconde entero
  // — sin tarjeta, se reemplaza por un recordatorio simple invitando a
  // registrar una y renovar antes del vencimiento (ver render más abajo).
  const sinOfertaReal = !!ra && ra.ahorro <= 0;

  const [inscribiendo, setInscribiendo] = useState(false);
  const [errInscripcion, setErrInscripcion] = useState("");

  // Mismo endpoint que AgregarTarjeta ("solo guardar", sin cobrar nada), pero
  // sin el paso de elegir patente/email: acá ya se sabe ambos por contexto.
  async function registrarTarjeta() {
    setErrInscripcion("");
    setInscribiendo(true);
    try {
      const res = await fetch("/api/pagos/oneclick/inscribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente: v.patente, email, soloGuardar: true }),
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

      {ra && !(sinOfertaReal && tarjeta) && (
        <div className="offer-card">
          {sinOfertaReal ? (
            <>
              <div className="offer-head">
                <span className="badge">Recordatorio</span>
                <h4>{ra.diasRestantes === undefined ? "Tu plan está por vencer" : fraseVenceEn(ra.diasRestantes)}</h4>
              </div>
              <div className="msg">
                Registra una tarjeta y renueva tu {v.plan} antes del vencimiento para mantener tu precio de compra ({fmtCLP(ra.pPromo)}).
              </div>
              {errInscripcion && <div className="err">{errInscripcion}</div>}
              <div className="offer-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn secondary" onClick={() => pedir("renovacion_temprana")} disabled={pagando !== null}>
                  {pagando === "renovacion_temprana" ? "Procesando..." : "PAGAR RENOVACIÓN"}
                </button>
                <button type="button" className="btn ghost" onClick={registrarTarjeta} disabled={inscribiendo}>
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
              <div className="msg">Renueva tu {v.plan} ahora mismo a precio preferencial.</div>
              <div className="price-row">
                <span className="old">{fmtCLP(ra.pNormal)}</span>
                <span className="new">{fmtCLP(ra.pPromo)}</span>
                <span className="save">Ahorras {fmtCLP(ra.ahorro)}</span>
              </div>
              <div className="hint" style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                Renovar ahora suma 30 días a la fecha de vencimiento de tu plan actual: no pierdes los días que ya tienes.
              </div>
              <button className="btn secondary" onClick={() => pedir("renovacion_temprana")} disabled={pagando !== null}>
                {pagando === "renovacion_temprana" ? "Procesando..." : "Renovar a precio preferencial"}
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
          <div className="msg">Reactiva tu {v.plan} ahora mismo a precio preferencial.</div>
          <div className="price-row">
            <span className="new">{fmtCLP(oferta.reactivacion.precio)}</span>
          </div>
          {oferta.reactivacion.pNormal > 0 && (
            <div className="hint" style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Precio promocional solo por este primer mes. Después tu plan vuelve a {fmtCLP(oferta.reactivacion.pNormal)},
              pagándolo antes del vencimiento.
            </div>
          )}
          <button className="btn secondary" onClick={() => pedir("reactivacion")} disabled={pagando !== null}>
            {pagando === "reactivacion" ? "Procesando..." : `Reactivar plan (${fmtCLP(oferta.reactivacion.precio)})`}
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
          <button className="btn secondary" onClick={() => pedir("upgrade_plan")} disabled={pagando !== null}>
            {pagando === "upgrade_plan" ? "Procesando..." : `Upgrade a plan (+${fmtCLP(oferta.upgrade.precio)})`}
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
            {errOferta && <div className="err">{errOferta}</div>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={cancelarConfirmacion} disabled={pagando !== null}>
                Cancelar
              </button>
              {rechazada && (
                <button type="button" className="btn ghost" onClick={pagarPorWebpayEnCambio} disabled={pagando !== null}>
                  {pagando !== null ? "Redirigiendo..." : "Pagar por Webpay"}
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
