"use client";

import { fmtCLP, fmtFecha, precioConHeredado } from "@/lib/helpers";
import { AvisoPasaAX5 } from "@/components/cliente/AvisoPasaAX5";
import type { PreciosPublicos } from "@/components/cliente/types";
import type { usePagarForm } from "./usePagarForm";

type Props = Pick<
  ReturnType<typeof usePagarForm>,
  "resultado" | "email" | "setEmail" | "inscribiendo" | "activarAutomatica"
> & { precios: PreciosPublicos };

// Todo lo que aparece después de buscar una patente: el estado del plan (o
// "no encontrado") y la inscripción de la tarjeta, que es la única forma de
// contratar o renovar el plan por web — el plan no se cobra por Webpay (ver
// TIPOS_VALIDOS en /api/pagos/webpay/crear), Webpay queda para el lavado
// único, la zona de aspirado y los servicios de detailing.
export function ResultadoBusqueda(p: Props) {
  const r = p.resultado;
  if (!r) return null;

  // Un cliente con precio heredado (ver precioConHeredado) renueva a ese
  // valor. Sin heredado es el precio público de la renovación automática.
  const precioAutoMensual = precioConHeredado(p.precios.planOneclick.precio, r);
  // Al cliente vencido con promoción (reactivación, o el upgrade desde su
  // lavado único) la inscripción de tarjeta le cobra ese precio y no el
  // mensual (ver precioPrimerCobroAuto / promoPrimerCobroOneclick): se
  // anuncia el que se va a cobrar, con el mensual de después al lado.
  const precioAuto = r.precioPrimerCobroAuto ?? precioAutoMensual;
  const promoPrimerMes = r.precioPrimerCobroAuto !== undefined;

  return (
    <div className={`result-card ${r.encontrado ? "found" : "notfound"}`}>
      {r.encontrado ? (
        <>
          <div className="result-head">
            <strong>{r.nombre}</strong>
            {r.estado && <span className={`status-pill ${r.estado.cls}`}>{r.estado.label}</span>}
          </div>
          <div className="info-grid">
            <div>
              <div className="k">Plan</div>
              <div className="v">{r.plan || "Sin plan"}</div>
            </div>
            {r.vencimiento && (
              <div>
                <div className="k">Vencimiento</div>
                <div className="v">{fmtFecha(r.vencimiento)}</div>
              </div>
            )}
          </div>
          <AvisoPasaAX5 plan={r.plan} vencimiento={r.estado?.cls !== "bad" ? r.vencimiento : null} />
          {/* El precio de la promoción ya viene rebajado desde
              /api/pagos/estado: esto solo explica de dónde sale, para que no se
              lea como un error. Sin promoción no se anuncia, porque el cobro
              mensual de la renovación automática no aplica el cupón (ver
              cobrarSuscripcion). */}
          {!!r.descuentoCupon && promoPrimerMes && (
            <div className="hint" style={{ textAlign: "left", color: "var(--green)", fontSize: 13, marginTop: 12 }}>
              Tienes un descuento de {fmtCLP(r.descuentoCupon)} para esta patente — ya está aplicado en el precio.
            </div>
          )}
        </>
      ) : (
        <p>No encontramos un cliente con esa patente. Puedes contratar el plan inscribiendo tu tarjeta.</p>
      )}

      <div className="field" style={{ marginTop: 14 }}>
        <label>Email (para confirmar la inscripción de tu tarjeta)</label>
        <input type="email" value={p.email} onChange={(e) => p.setEmail(e.target.value)} placeholder="tu@email.cl" />
        {(promoPrimerMes || r.ticketReactivacion) && (
          <div className="hint" style={{ textAlign: "left", color: "var(--green)", fontSize: 13, marginTop: 8 }}>
            {promoPrimerMes && <>Precio promocional por este mes; desde el próximo, {fmtCLP(precioAutoMensual)}/mes. </>}
            {r.ticketReactivacion && <>Además te regalamos 1 lavado full túnel gratis por registrar tu tarjeta.</>}
          </div>
        )}
        <button className="btn" style={{ marginTop: 10 }} onClick={p.activarAutomatica} disabled={p.inscribiendo}>
          {p.inscribiendo
            ? "Redirigiendo..."
            : `Activar renovación automática — ${fmtCLP(precioAuto)}${promoPrimerMes ? " el primer mes" : "/mes"}`}
        </button>
      </div>
    </div>
  );
}
