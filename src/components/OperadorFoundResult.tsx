"use client";

import { useRef } from "react";
import {
  esNombreVacio,
  fmtTelefono,
  isValidTelefono,
  mensajeBloqueoReingreso,
  mensajeSinPases,
  planVigente,
  PASES_INCLUIDOS_X5,
  plateEstadoCls,
} from "@/lib/helpers";
import type { Cliente } from "@/types";
import { DetailList, DetailRow } from "@/components/DetailList";
import { useOperadorFoundResult } from "@/components/operador/useOperadorFoundResult";
import OperadorFoundOfertas from "@/components/operador/OperadorFoundOfertas";
import QrReferido from "@/components/operador/QrReferido";
import { useAppData } from "@/context/AppContext";

export default function OperadorFoundResult({ cliente, clearPlate }: { cliente: Cliente; clearPlate: () => void }) {
  const { data, guardando } = useAppData();
  const nombreRef = useRef<HTMLInputElement>(null);
  const vehiculoRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const r = useOperadorFoundResult(cliente, clearPlate, { nombreRef, vehiculoRef, telefonoRef, emailRef });
  const { c } = r;

  return (
    <>
      {r.registroIncompleto && (
        <div className="err" style={{ marginBottom: 10 }}>
          Registro de Cliente Incompleto: completa los datos faltantes arriba y presiona la opción de ingreso o plan
          que corresponda — se guardarán automáticamente
        </div>
      )}
      <OperadorFoundOfertas {...r} />
      {r.guardarErr && <div className="err" style={{ marginBottom: 10 }}>{r.guardarErr}</div>}
      <div className="result-card found">
        <div className="result-head">
          {!esNombreVacio(c.nombre) ? (
            <h3>{c.nombre}</h3>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, marginRight: 10 }}>
              <input
                ref={nombreRef}
                placeholder="Nombre del cliente"
                style={{
                  flex: 1,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--white)",
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 15,
                }}
              />
              <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={r.guardarNombre}>
                Guardar
              </button>
            </div>
          )}
          <span className={`status-pill ${r.st.cls}`}>{r.st.label}</span>
        </div>
        <DetailList className="mt-3">
          <DetailRow label="Patente" value={c.patente} valueClassName={`plate-tag ${plateEstadoCls(c)}`} />
          <DetailRow
            label="Vehículo"
            value={
              c.vehiculo ? (
                c.vehiculo
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={vehiculoRef}
                    placeholder="Ej: Toyota Yaris"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--white)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      fontSize: 13,
                      width: 140,
                    }}
                  />
                  <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={r.guardarVehiculo}>
                    Guardar
                  </button>
                </div>
              )
            }
          />
          {/* planVigente y no c.plan: al que renovó anticipado le queda el X5
              guardado, pero hasta que termine el mes que ya tenía comprado
              sigue sin tope — es lo que tiene que leer el operador. */}
          <DetailRow label="Plan" value={planVigente(c) || "-"} />
          <DetailRow label="Vence" value={c.vencimiento ? new Date(c.vencimiento).toLocaleDateString("es-CL") : "-"} />
          <DetailRow label="Visitas totales" value={c.visitas || 0} />
          {/* Solo para planes con tope (X5): el ilimitado viejo no tiene qué contar. */}
          {r.pasesQueQuedan !== null && (
            <DetailRow
              label="Lavado del período"
              value={
                r.pasesQueQuedan > 0
                  ? `Va por el N°${r.visitasPeriodo + 1} de ${PASES_INCLUIDOS_X5} (quedan ${r.pasesQueQuedan})`
                  : `Ya usó los ${PASES_INCLUIDOS_X5} del período`
              }
            />
          )}
          <DetailRow
            // Vacío también cuando el número no tenía WhatsApp (ver
            // vaciarTelefonoSinWhatsapp): si el cliente repite el mismo, se
            // vuelve a vaciar solo.
            label={c.telefono && isValidTelefono(c.telefono) ? "Teléfono" : "Teléfono (pida un celular con WhatsApp)"}
            value={
              c.telefono && isValidTelefono(c.telefono) ? (
                fmtTelefono(c.telefono)
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={telefonoRef}
                    defaultValue={c.telefono || "+569"}
                    placeholder="+569 -1111 1111"
                    onBlur={r.onTelefonoBlur}
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--white)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      fontSize: 13,
                      width: 140,
                    }}
                  />
                  <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={r.guardarTelefono}>
                    Guardar
                  </button>
                </div>
              )
            }
          />
          <DetailRow
            label="Correo electrónico"
            value={
              c.email ? (
                c.email
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={emailRef}
                    type="email"
                    placeholder="correo@ejemplo.com"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--white)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      fontSize: 13,
                      width: 140,
                    }}
                  />
                  <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={r.guardarEmail}>
                    Guardar
                  </button>
                </div>
              )
            }
          />
        </DetailList>
        {/* Las opciones de cobro (lavado, plan, QR) están todas en la lista
            numerada de arriba (OperadorFoundOfertas); acá solo el porqué. */}
        {r.planVigente && r.estadoIngreso === "sin_pases" ? (
          <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
            {mensajeSinPases(c)} Para que ingrese igual, usa la opción de lavado de arriba.
          </div>
        ) : r.planVigente && r.estadoIngreso === "bloqueado" ? (
          <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
            {mensajeBloqueoReingreso(data.ingresos, c.id, r.horasBloqueoReingreso)} Para que ingrese igual, usa la
            opción de lavado de arriba.
          </div>
        ) : r.planVigente ? (
          <button className="btn" style={{ marginTop: 16 }} onClick={r.registrar} disabled={guardando}>
            {guardando ? "Guardando…" : "Registrar ingreso"}
          </button>
        ) : (
          <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
            Este cliente no tiene un plan vigente. Elige una de las opciones de arriba.
          </div>
        )}
      </div>
      <QrReferido patente={c.patente} valor={data.config.descuentoReferidoValor} />
    </>
  );
}
