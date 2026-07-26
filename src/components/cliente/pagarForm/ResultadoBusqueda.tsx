"use client";

import { fmtCLP, fmtFecha } from "@/lib/helpers";
import GoogleIcon from "@/components/GoogleIcon";
import type { PreciosPublicos } from "@/components/cliente/types";
import type { usePagarForm } from "./usePagarForm";

type Props = Pick<
  ReturnType<typeof usePagarForm>,
  | "resultado"
  | "mostrarAuto"
  | "setMostrarAuto"
  | "pagando"
  | "accionPlan"
  | "pasoMetodo"
  | "elegirMetodo"
  | "cancelarMetodo"
  | "conectarGoogle"
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
  if (!r) return null;

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
          {!p.mostrarAuto && (
            <button
              className="btn"
              style={{ marginTop: 16 }}
              onClick={() => p.elegirMetodo("renovacion", "Renovar plan")}
              disabled={p.pagando !== null || p.accionPlan !== null}
            >
              {p.pagando === "renovacion" ? "Redirigiendo..." : `Renovar plan — ${fmtCLP(p.precios.plan.precio)}`}
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
              {p.pagando === "plan_nuevo" ? "Redirigiendo..." : `Contratar plan — ${fmtCLP(p.precios.plan.precio)}`}
            </button>
          )}
        </>
      )}

      {p.accionPlan && (
        <div className="card" style={{ marginTop: 16 }}>
          {p.pasoMetodo === "elegir" && (
            <>
              <p style={{ marginBottom: 12 }}>¿Cómo quieres pagar tu {p.accionPlan.label.toLowerCase()}?</p>
              <button className="btn" onClick={p.confirmarPago} disabled={p.pagando !== null}>
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
                  <button className="btn" onClick={p.confirmarPago} disabled={p.pagando !== null}>
                    Continuar como Invitado por ahora
                  </button>
                  <button type="button" className="btn ghost" style={{ marginTop: 10 }} onClick={p.cancelarMetodo}>
                    Cancelar
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {!p.soloPagoUnico &&
        (!p.mostrarAuto ? (
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => p.setMostrarAuto(true)}>
            Renovación automática — {fmtCLP(p.precios.planOneclick.precio)}/mes (ahorras{" "}
            {fmtCLP(p.precios.plan.precio - p.precios.planOneclick.precio)})
          </button>
        ) : (
          <div className="field" style={{ marginTop: 14 }}>
            <label>Email (para confirmar la inscripción de tu tarjeta)</label>
            <input type="email" value={p.email} onChange={(e) => p.setEmail(e.target.value)} placeholder="tu@email.cl" />
            <button className="btn" style={{ marginTop: 10 }} onClick={p.activarAutomatica} disabled={p.inscribiendo}>
              {p.inscribiendo ? "Redirigiendo..." : `Activar renovación automática — ${fmtCLP(p.precios.planOneclick.precio)}/mes`}
            </button>
          </div>
        ))}
    </div>
  );
}
