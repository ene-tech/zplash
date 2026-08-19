"use client";

import { useRef } from "react";
import {
  esNombreVacio,
  fmtCLP,
  fmtTelefono,
  isValidTelefono,
  mensajeBloqueoReingreso,
  mensajeSinPases,
  PASES_INCLUIDOS_X5,
  plateEstadoCls,
} from "@/lib/helpers";
import type { Cliente } from "@/types";
import { DetailList, DetailRow } from "@/components/DetailList";
import { useOperadorFoundResult } from "@/components/operador/useOperadorFoundResult";
import OperadorFoundOfertas from "@/components/operador/OperadorFoundOfertas";
import { useApp } from "@/context/AppContext";

export default function OperadorFoundResult({ cliente, clearPlate }: { cliente: Cliente; clearPlate: () => void }) {
  const { data } = useApp();
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
          <DetailRow label="Plan" value={c.plan || "-"} />
          <DetailRow label="Vence" value={c.vencimiento ? new Date(c.vencimiento).toLocaleDateString("es-CL") : "-"} />
          <DetailRow label="Visitas totales" value={c.visitas || 0} />
          {/* Solo para planes con tope (X5): el ilimitado viejo no tiene qué contar. */}
          {r.pasesQueQuedan !== null && (
            <DetailRow label="Pasadas del período" value={`${r.pasesQueQuedan} disponibles de ${PASES_INCLUIDOS_X5}`} />
          )}
          <DetailRow
            label="Teléfono"
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
        {r.planVigente && r.estadoIngreso === "sin_pases" ? (
          <>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
              {mensajeSinPases(c)}
            </div>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={r.cobrarLavadoUnico}>
              Comprar lavado por {fmtCLP(r.precioLavadoUnicoFinal)} e ingresar de todas formas
            </button>
          </>
        ) : r.planVigente && r.estadoIngreso === "bloqueado" ? (
          <>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
              {mensajeBloqueoReingreso(data.ingresos, c.id, r.horasBloqueoReingreso)}
            </div>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={r.cobrarLavadoUnico}>
              Comprar lavado por {fmtCLP(r.precioLavadoUnicoFinal)} e ingresar de todas formas
            </button>
          </>
        ) : r.planVigente ? (
          <button className="btn" style={{ marginTop: 16 }} onClick={r.registrar}>
            Registrar ingreso
          </button>
        ) : (
          <>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
              Este cliente no tiene un plan vigente. Elige el tipo de lavado:
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn" style={{ marginTop: 0, flex: "1 1 160px" }} onClick={r.contratarPlan}>
                Contratar plan nuevo ({fmtCLP(r.pContratacion)})
              </button>
              <button className="btn secondary" style={{ marginTop: 0, flex: "1 1 160px" }} onClick={r.registrarPagado}>
                Lavado Full Túnel ({fmtCLP(r.precioLavadoUnicoFinal)})
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
