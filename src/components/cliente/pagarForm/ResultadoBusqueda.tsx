"use client";

import { useState } from "react";
import { PASES_INCLUIDOS_X3, PASES_INCLUIDOS_X5, PLAN_X3, PLAN_X5, type PlanOneclick, fmtCLP, fmtVencimiento, precioConHeredado } from "@/lib/helpers";
import { AvisoPasaAX5 } from "@/components/cliente/AvisoPasaAX5";
import type { PreciosPublicos } from "@/components/cliente/types";
import { CampoCelular } from "./CampoCelular";
import type { usePagarForm } from "./usePagarForm";

type Props = Pick<
  ReturnType<typeof usePagarForm>,
  "resultado" | "email" | "setEmail" | "telefono" | "setTelefono" | "inscribiendo" | "activarAutomatica"
> & { precios: PreciosPublicos };

// Todo lo que aparece después de buscar una patente: el estado del plan (o
// "no encontrado") y la inscripción de la tarjeta, que es la única forma de
// contratar o renovar el plan por web — el plan no se cobra por Webpay (ver
// TIPOS_VALIDOS en /api/pagos/webpay/crear), Webpay queda para el lavado
// único, la zona de aspirado y los servicios de detailing.
export function ResultadoBusqueda(p: Props) {
  const [aceptaPoliticas, setAceptaPoliticas] = useState(false);
  // X5 o X3 (nov-2026): el cliente elige qué plan cobra la tarjeta. Parte en
  // el que ya tiene si es el X3, si no en el X5 de siempre.
  const [planElegido, setPlanElegido] = useState<PlanOneclick>(p.resultado?.plan === PLAN_X3 ? PLAN_X3 : PLAN_X5);
  const r = p.resultado;
  if (!r) return null;
  const esX3 = planElegido === PLAN_X3;

  // Un cliente con precio heredado (ver precioConHeredado) renueva a ese
  // valor. Sin heredado es el precio público de la renovación automática.
  // El heredado es del X5: el X3 se cobra siempre a su precio (ver
  // cobrarSuscripcion).
  const precioX5Mensual = precioConHeredado(p.precios.planOneclick.precio, r);
  const precioX3Mensual = p.precios.planX3Oneclick?.precio ?? 0;
  const precioAutoMensual = esX3 ? precioX3Mensual : precioX5Mensual;
  // Cuando el primer cobro sale más barato que el mensual —promoción de
  // reactivación, cupón de descuento de la patente, o las dos— la
  // inscripción de tarjeta cobra ese precio y no el mensual (ver
  // precioPrimerCobroAuto): se anuncian los dos, el de ahora y el de después.
  // El X3 no tiene promoción de reactivación, solo el cupón.
  const primerCobro = esX3 ? r.precioPrimerCobroX3 : r.precioPrimerCobroAuto;
  const precioAuto = primerCobro ?? precioAutoMensual;
  const promoPrimerMes = primerCobro !== undefined;
  const descuentoCupon = esX3 ? (r.precioPrimerCobroX3 !== undefined ? precioX3Mensual - r.precioPrimerCobroX3 : 0) : r.descuentoCupon;
  const opciones = [
    { plan: PLAN_X5, pases: PASES_INCLUIDOS_X5, precio: precioX5Mensual },
    { plan: PLAN_X3, pases: PASES_INCLUIDOS_X3, precio: precioX3Mensual },
  ] as const;

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
                <div className="k">Válido hasta (incluido)</div>
                <div className="v">{fmtVencimiento(r.vencimiento)}</div>
              </div>
            )}
          </div>
          {!esX3 && <AvisoPasaAX5 plan={r.plan} vencimiento={r.estado?.cls !== "bad" ? r.vencimiento : null} />}
          {/* El precio del primer cobro ya viene rebajado desde
              /api/pagos/estado: esto solo explica de dónde sale, para que no se
              lea como un error. Atado a promoPrimerMes porque el cupón solo
              rebaja ese primer cobro — se quema ahí (ver cobrarSuscripcion) y
              los meses siguientes vuelven al precio de lista. */}
          {!!descuentoCupon && promoPrimerMes && (
            <div className="hint" style={{ textAlign: "left", color: "var(--green)", fontSize: 13, marginTop: 12 }}>
              Tienes un descuento de {fmtCLP(descuentoCupon)} para esta patente — ya está aplicado en el precio.
            </div>
          )}
        </>
      ) : (
        <p>No encontramos un cliente con esa patente. Puedes contratar el plan inscribiendo tu tarjeta.</p>
      )}

      {/* Elección del plan que cobra la tarjeta: mismo producto, distinta
          cantidad de lavados Full Túnel por mes. */}
      <div role="radiogroup" aria-label="Plan" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
        {opciones.map((o) => {
          const activo = planElegido === o.plan;
          return (
            <button
              key={o.plan}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setPlanElegido(o.plan)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: `2px solid ${activo ? "var(--green)" : "var(--line, #d0d5dd)"}`,
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <strong style={{ display: "block" }}>{o.plan}</strong>
              <span style={{ display: "block", fontSize: 13 }}>{o.pases} lavados Full Túnel al mes</span>
              <span style={{ display: "block", fontSize: 13, marginTop: 4 }}>{fmtCLP(o.precio)}/mes</span>
            </button>
          );
        })}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>Email (para confirmar la inscripción de tu tarjeta)</label>
        <input type="email" value={p.email} onChange={(e) => p.setEmail(e.target.value)} placeholder="tu@email.cl" />
        <CampoCelular value={p.telefono} onChange={p.setTelefono} />
        {(promoPrimerMes || r.ticketReactivacion) && (
          <div className="hint" style={{ textAlign: "left", color: "var(--green)", fontSize: 13, marginTop: 8 }}>
            {promoPrimerMes && (
              <>
                Pagas {fmtCLP(precioAuto)} el primer mes; desde el próximo, {fmtCLP(precioAutoMensual)}/mes.{" "}
              </>
            )}
            {r.ticketReactivacion && <>Además te regalamos 1 lavado full túnel gratis por registrar tu tarjeta.</>}
          </div>
        )}
        {/* El botón dice qué se está contratando, y apretarlo ES la aceptación
            del cliente del ilimitado viejo a pasarse al X5 (ver
            requiereValidacionX5 y su registro en /api/pagos/oneclick/inscribir).
            Por eso al cliente legacy no le puede decir "renovación": lo que
            firma acá es un producto distinto del que tenía. */}
        {/* La aceptación se registra en /inscripcion/retorno, con la
            inscripción ya confirmada por Transbank (ver aceptoX5En ahí). */}
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 13, textAlign: "left" }}>
          <input
            type="checkbox"
            checked={aceptaPoliticas}
            onChange={(e) => setAceptaPoliticas(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Acepto las{" "}
            <a href="/politicas" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              Políticas de Funcionamiento y Garantía
            </a>{" "}
            y que el plan se cobre automáticamente cada mes en esta tarjeta hasta que lo cancele.
          </span>
        </label>
        <button
          className="btn"
          style={{ marginTop: 10 }}
          onClick={() => p.activarAutomatica(planElegido)}
          disabled={p.inscribiendo || !aceptaPoliticas}
        >
          {p.inscribiendo
            ? "Redirigiendo..."
            : // Contratar el X5 desde el ilimitado viejo, o un plan distinto del
              // que tiene, es otro producto: el botón lo nombra.
              r.requiereValidacionX5 || (r.plan || "") !== planElegido
              ? `Contratar ${planElegido} — ${fmtCLP(precioAuto)}${promoPrimerMes ? " el primer mes" : "/mes"}`
              : `Activar renovación automática — ${fmtCLP(precioAuto)}${promoPrimerMes ? " el primer mes" : "/mes"}`}
        </button>
      </div>
    </div>
  );
}
