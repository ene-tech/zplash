"use client";

import { useRef, useState } from "react";
import {
  esNombreVacio,
  fmtTelefono,
  fmtVencimiento,
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
import AvisoContactoCliente from "@/components/operador/AvisoContactoCliente";
import QrReferido from "@/components/operador/QrReferido";
import { useAppData } from "@/context/AppContext";

type CampoEditable = "nombre" | "telefono" | "email";

export default function OperadorFoundResult({
  cliente,
  clearPlate,
  codigoDescuento,
}: {
  cliente: Cliente;
  clearPlate: () => void;
  codigoDescuento?: string;
}) {
  const { data, guardando } = useAppData();
  const nombreRef = useRef<HTMLInputElement>(null);
  const vehiculoRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const r = useOperadorFoundResult(cliente, clearPlate, { nombreRef, vehiculoRef, telefonoRef, emailRef }, codigoDescuento);
  const { c } = r;
  // Nombre, teléfono o correo ya guardados que el operador está corrigiendo
  // (botón "Editar"). Va atado al id para que buscar otra patente no deje
  // abierto el campo en la ficha siguiente.
  const [edicion, setEdicion] = useState<{ id: string; campo: CampoEditable } | null>(null);
  const editando = edicion?.id === c.id ? edicion.campo : null;
  const editar = (campo: CampoEditable) => setEdicion({ id: c.id, campo });
  const guardarEdicion = (guardar: () => Promise<boolean>) => async () => {
    if (await guardar()) setEdicion(null);
  };
  const botonesEdicion = (guardar: () => Promise<boolean>, conValor: boolean) => (
    <>
      <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={guardarEdicion(guardar)}>
        Guardar
      </button>
      {conValor && (
        <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={() => setEdicion(null)}>
          Cancelar
        </button>
      )}
    </>
  );
  const botonEditar = (campo: CampoEditable) => (
    <button className="icon-btn" style={{ whiteSpace: "nowrap", fontSize: 12 }} onClick={() => editar(campo)}>
      Editar
    </button>
  );
  const telefonoValido = !!c.telefono && isValidTelefono(c.telefono);

  // Cliente non grato (ver nonGrato en @/db/schema/clientes): ni ofertas ni
  // botones de ingreso o cobro, solo el aviso.
  if (c.nonGrato) {
    return (
      <div className="result-card found">
        <div className="result-head">
          <h3>{esNombreVacio(c.nombre) ? c.patente : c.nombre}</h3>
          <span className="status-pill bad">Non grato</span>
        </div>
        <div className="err" style={{ marginTop: 12, fontSize: 16 }}>
          Cliente non grato: no puede pasar. No se le da ingreso ni se le cobra ningún lavado.
        </div>
        <DetailList className="mt-3">
          <DetailRow label="Patente" value={c.patente} valueClassName="plate-tag" />
        </DetailList>
      </div>
    );
  }

  return (
    <>
      {r.registroIncompleto && (
        <div className="err" style={{ marginBottom: 10 }}>
          Registro de Cliente Incompleto: completa los datos faltantes arriba y presiona la opción de ingreso o plan
          que corresponda — se guardarán automáticamente
        </div>
      )}
      <AvisoContactoCliente cliente={c} onActualizado={r.updateResult} />
      <OperadorFoundOfertas {...r} />
      {r.guardarErr && <div className="err" style={{ marginBottom: 10 }}>{r.guardarErr}</div>}
      <div className="result-card found">
        <div className="result-head">
          {!esNombreVacio(c.nombre) && editando !== "nombre" ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, marginRight: 10 }}>
              <h3>{c.nombre}</h3>
              {botonEditar("nombre")}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, marginRight: 10 }}>
              <input
                ref={nombreRef}
                defaultValue={esNombreVacio(c.nombre) ? "" : c.nombre}
                autoFocus={editando === "nombre"}
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
              {botonesEdicion(r.guardarNombre, !esNombreVacio(c.nombre))}
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
          <DetailRow label="Válido hasta (incluido)" value={c.vencimiento ? fmtVencimiento(c.vencimiento) : "-"} />
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
            label={telefonoValido ? "Teléfono" : "Teléfono (pida un celular con WhatsApp)"}
            value={
              telefonoValido && editando !== "telefono" ? (
                <div className="flex items-center gap-1.5">
                  {fmtTelefono(c.telefono)}
                  {botonEditar("telefono")}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={telefonoRef}
                    defaultValue={telefonoValido ? fmtTelefono(c.telefono) : c.telefono || "+569"}
                    autoFocus={editando === "telefono"}
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
                  {botonesEdicion(r.guardarTelefono, telefonoValido)}
                </div>
              )
            }
          />
          <DetailRow
            label="Correo electrónico"
            value={
              c.email && editando !== "email" ? (
                <div className="flex items-center gap-1.5">
                  {c.email}
                  {botonEditar("email")}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={emailRef}
                    type="email"
                    defaultValue={c.email || ""}
                    autoFocus={editando === "email"}
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
                  {botonesEdicion(r.guardarEmail, !!c.email)}
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
