"use client";

import { useEffect } from "react";
import { fmtCLP, fmtFecha, precioConHeredado } from "@/lib/helpers";
import GoogleIcon from "@/components/GoogleIcon";
import { AvisoPasaAX5 } from "@/components/cliente/AvisoPasaAX5";
import type { PreciosPublicos } from "@/components/cliente/types";
import { CamposDocumento } from "./CamposDocumento";
import { useDatosDocumento } from "./useDatosDocumento";
import type { usePagarForm } from "./usePagarForm";

type Props = Pick<
  ReturnType<typeof usePagarForm>,
  | "resultado"
  | "mostrarAuto"
  | "setMostrarAuto"
  | "pagando"
  | "err"
  | "accionPlan"
  | "pasoMetodo"
  | "elegirMetodo"
  | "cancelarMetodo"
  | "conectarGoogle"
  | "irADocumento"
  | "confirmarPago"
  | "soloPagoUnico"
  | "email"
  | "setEmail"
  | "inscribiendo"
  | "activarAutomatica"
> & { precios: PreciosPublicos };

// Todo lo que aparece después de buscar una patente: el estado del plan (o
// "no encontrado"), el flujo de elegir método de pago (invitado vs. vista
// previa de login con Google) antes de confirmar, y la oferta de activar la
// renovación automática (Oneclick).
export function ResultadoBusqueda(p: Props) {
  const r = p.resultado;
  const doc = useDatosDocumento();
  // A diferencia de PagoUnicoCard/ServicioDocumentoCard, este componente no se
  // desmonta entre pagos (sigue montado mientras dura la sesión en /pagar) —
  // sin esto, los datos de Factura llenados para una patente quedarían
  // precargados si el cliente cancela, busca otra patente y vuelve a pagar.
  useEffect(() => {
    if (p.pasoMetodo === "documento") doc.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doc.reset es estable en los datos que limpia, solo debe correr al entrar al paso
  }, [p.pasoMetodo]);
  if (!r) return null;

  // Precios de esta patente: un cliente con precio heredado (ver
  // precioConHeredado) renueva a ese valor, tanto pagando el mes como
  // activando la renovación automática. Sin heredado son los precios públicos.
  //
  // El botón de renovar NO recalcula nada: muestra el precio que ya resolvió
  // /api/pagos/estado con el mismo helper que cobra /api/pagos/webpay/crear
  // (ver precioRenovacionCliente), porque con el plan vencido el monto
  // depende del plazo de gracia y de los precios de la base, no solo del
  // heredado. El precio público queda de respaldo por si el endpoint es de
  // una versión anterior y no manda el campo.
  const precioRenovar = r.precioRenovacion ?? precioConHeredado(p.precios.plan.precio, r);
  const precioAutoMensual = precioConHeredado(p.precios.planOneclick.precio, r);
  // Al cliente vencido con promoción de reactivación la inscripción de
  // tarjeta le cobra ese precio y no el mensual (ver precioPrimerCobroAuto):
  // se anuncia el que se va a cobrar, con el mensual de después al lado.
  const precioAuto = r.precioPrimerCobroAuto ?? precioAutoMensual;
  const promoPrimerMes = precioAuto !== precioAutoMensual;
  const ahorroAuto = precioRenovar - precioAuto;

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
          {/* El precio ya viene rebajado desde /api/pagos/estado: esto solo
              explica de dónde sale, para que no se lea como un error. */}
          {!!r.descuentoCupon && (
            <div className="hint" style={{ textAlign: "left", color: "var(--green)", fontSize: 13, marginTop: 12 }}>
              Tienes un descuento de {fmtCLP(r.descuentoCupon)} para esta patente — ya está aplicado en el precio.
            </div>
          )}
          {!p.mostrarAuto && (
            <button
              className="btn"
              style={{ marginTop: 16 }}
              onClick={() => p.elegirMetodo("renovacion", "Renovar plan")}
              disabled={p.pagando !== null || p.accionPlan !== null}
            >
              {p.pagando === "renovacion" ? "Redirigiendo..." : `Renovar plan — ${fmtCLP(precioRenovar)}`}
            </button>
          )}
        </>
      ) : (
        <>
          <p>No encontramos un cliente con esa patente.</p>
          {!p.mostrarAuto && (
            <button
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() => p.elegirMetodo("plan_nuevo", "Contratar plan")}
              disabled={p.pagando !== null || p.accionPlan !== null}
            >
              {p.pagando === "plan_nuevo" ? "Redirigiendo..." : `Contratar plan — ${fmtCLP(p.precios.planPrimera.precio)}`}
            </button>
          )}
        </>
      )}

      {p.accionPlan && (
        <div className="card" style={{ marginTop: 16 }}>
          {p.pasoMetodo === "elegir" && (
            <>
              <p style={{ marginBottom: 12 }}>¿Cómo quieres pagar tu {p.accionPlan.label.toLowerCase()}?</p>
              <button className="btn" onClick={p.irADocumento} disabled={p.pagando !== null}>
                Pagar como Invitado
              </button>
              <button
                type="button"
                className="google-btn"
                style={{ marginTop: 10, width: "100%" }}
                onClick={p.conectarGoogle}
                disabled={p.pagando !== null}
              >
                <GoogleIcon />
                Inicio de sesión con Google
              </button>
              <button type="button" className="btn ghost" style={{ marginTop: 10 }} onClick={p.cancelarMetodo}>
                Cancelar
              </button>
            </>
          )}
          {(p.pasoMetodo === "google-conectando" || p.pasoMetodo === "google-preview") && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <GoogleIcon />
                <span>{p.pasoMetodo === "google-conectando" ? "Conectando con Google..." : "Vista previa"}</span>
              </div>
              {p.pasoMetodo === "google-preview" && (
                <>
                  <p style={{ color: "var(--gray)", fontSize: 13, marginBottom: 12 }}>
                    El inicio de sesión con Google todavía no está conectado. Cuando esté disponible, tu patente
                    quedará registrada a la cuenta de Google con la que inicies sesión, para que puedas ver tus
                    pagos y renovaciones desde Mi Cuenta.
                  </p>
                  <button className="btn" onClick={p.irADocumento} disabled={p.pagando !== null}>
                    Continuar como Invitado por ahora
                  </button>
                  <button type="button" className="btn ghost" style={{ marginTop: 10 }} onClick={p.cancelarMetodo}>
                    Cancelar
                  </button>
                </>
              )}
            </>
          )}
          {p.pasoMetodo === "documento" && (
            <>
              <p style={{ marginBottom: 12 }}>Elige cómo quieres recibir el comprobante:</p>
              <CamposDocumento d={doc} />
              <div className="err">{doc.error || p.err}</div>
              <button
                className="btn"
                onClick={() => {
                  const datosDocumento = doc.validar();
                  if (datosDocumento) p.confirmarPago(datosDocumento);
                }}
                disabled={p.pagando !== null}
              >
                {p.pagando !== null ? "Redirigiendo..." : "Pagar ahora"}
              </button>
              <button type="button" className="btn ghost" style={{ marginTop: 10 }} onClick={p.cancelarMetodo}>
                Cancelar
              </button>
            </>
          )}
        </div>
      )}

      {!p.soloPagoUnico &&
        (!p.mostrarAuto ? (
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => p.setMostrarAuto(true)}>
            Renovación automática — {fmtCLP(precioAuto)}
            {promoPrimerMes ? " el primer mes" : "/mes"}
            {ahorroAuto > 0 && <> (ahorras {fmtCLP(ahorroAuto)})</>}
          </button>
        ) : (
          <div className="field" style={{ marginTop: 14 }}>
            <label>Email (para confirmar la inscripción de tu tarjeta)</label>
            <input type="email" value={p.email} onChange={(e) => p.setEmail(e.target.value)} placeholder="tu@email.cl" />
            {(promoPrimerMes || r.ticketReactivacion) && (
              <div className="hint" style={{ textAlign: "left", color: "var(--green)", fontSize: 13, marginTop: 8 }}>
                {promoPrimerMes && <>Precio de reactivación por este mes; desde el próximo, {fmtCLP(precioAutoMensual)}/mes. </>}
                {r.ticketReactivacion && <>Además te regalamos 1 lavado full túnel gratis por registrar tu tarjeta.</>}
              </div>
            )}
            <button className="btn" style={{ marginTop: 10 }} onClick={p.activarAutomatica} disabled={p.inscribiendo}>
              {p.inscribiendo
                ? "Redirigiendo..."
                : `Activar renovación automática — ${fmtCLP(precioAuto)}${promoPrimerMes ? " el primer mes" : "/mes"}`}
            </button>
          </div>
        ))}
    </div>
  );
}
