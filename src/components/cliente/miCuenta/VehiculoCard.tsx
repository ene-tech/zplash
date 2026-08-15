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
import { useOfertaPlan, type TarjetaGuardada, type TipoOfertaPlan } from "@/components/cliente/miCuenta/useOfertaPlan";

type Accion = "cambio" | "quitar" | null;

const NOMBRE_OFERTA: Record<TipoOfertaPlan, string> = {
  renovacion_temprana: "Renovación anticipada",
  reactivacion: "Reactivación de plan",
  upgrade_plan: "Upgrade a Plan Ilimitado",
};

// Tarjeta de "Mis vehículos" en Mi Cuenta. "Solicitar cambio de patente" y
// "Quitar de mi cuenta" viven en el menú "⋮" de la esquina superior derecha
// (mismo patrón que MobileRowMenu en el panel de operador) en vez de ir como
// botones sueltos — SolicitudCambioPatente/QuitarVehiculo quedan montados
// siempre (así conservan su propio estado de error/envío) y solo se les
// controla la visibilidad vía `abierto`.
export function VehiculoCard({
  v,
  oferta,
  tarjeta,
  onActualizado,
}: {
  v: VehiculoSesion;
  oferta?: OfertaPlan;
  tarjeta?: TarjetaGuardada;
  onActualizado: () => void;
}) {
  const [accion, setAccion] = useState<Accion>(null);
  const tieneCambioPatente = v.plan !== "Sin plan";
  const {
    pagando,
    confirmando,
    err: errOferta,
    rechazada,
    pedir,
    cancelarConfirmacion,
    confirmarConTarjeta,
    pagarPorWebpayEnCambio,
  } = useOfertaPlan(v.patente, tarjeta ?? null, onActualizado);

  const montoOferta = (tipo: TipoOfertaPlan): number | undefined =>
    tipo === "renovacion_temprana" ? oferta?.renovacionAnticipada?.pPromo : tipo === "reactivacion" ? oferta?.reactivacion?.precio : oferta?.upgrade?.precio;

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
              <DropdownMenuItem variant="destructive" onClick={() => setAccion("quitar")}>
                Quitar de mi cuenta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {v.vencimiento && <div style={{ color: "var(--gray)", fontSize: 12.5, marginTop: 6 }}>Vence el {fmtFecha(v.vencimiento)}</div>}

      {oferta?.renovacionAnticipada && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Oferta</span>
            <h4>
              {oferta.renovacionAnticipada.diasRestantes === undefined
                ? "Renovación anticipada disponible"
                : "Tu plan vence en " +
                  (oferta.renovacionAnticipada.diasRestantes <= 0
                    ? "hoy"
                    : oferta.renovacionAnticipada.diasRestantes + " día" + (oferta.renovacionAnticipada.diasRestantes === 1 ? "" : "s"))}
            </h4>
          </div>
          <div className="msg">Renueva tu {v.plan} ahora mismo a precio preferencial.</div>
          <div className="price-row">
            <span className="old">{fmtCLP(oferta.renovacionAnticipada.pNormal)}</span>
            <span className="new">{fmtCLP(oferta.renovacionAnticipada.pPromo)}</span>
            <span className="save">Ahorras {fmtCLP(oferta.renovacionAnticipada.ahorro)}</span>
          </div>
          <div className="hint" style={{ color: "var(--gray)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            Renovar ahora suma 30 días a la fecha de vencimiento de tu plan actual: no pierdes los días que ya tienes.
          </div>
          <button className="btn secondary" onClick={() => pedir("renovacion_temprana")} disabled={pagando !== null}>
            {pagando === "renovacion_temprana" ? "Procesando..." : "Renovar a precio preferencial"}
          </button>
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
          <button className="btn secondary" onClick={() => pedir("reactivacion")} disabled={pagando !== null}>
            {pagando === "reactivacion" ? "Procesando..." : `Reactivar plan (${fmtCLP(oferta.reactivacion.precio)})`}
          </button>
        </div>
      )}
      {oferta?.upgrade && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción</span>
            <h4>¿Pasarte a Plan Ilimitado?</h4>
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
      <QuitarVehiculo patente={v.patente} abierto={accion === "quitar"} onCerrar={() => setAccion(null)} onQuitado={onActualizado} />
    </div>
  );
}
