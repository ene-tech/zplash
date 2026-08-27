"use client";

import { useRef } from "react";
import { useAppData } from "@/context/AppContext";
import DatosTransferencia from "@/components/DatosTransferencia";
import PriceInput from "@/components/PriceInput";
import { fmtCLP, fmtTelefono, todayYMD } from "@/lib/helpers";
import { DetailList, DetailRow } from "@/components/DetailList";
import { useServiciosAdicionalesForm } from "@/components/servicios/useServiciosAdicionalesForm";
import ServicioCatalogoSelector from "@/components/servicios/ServicioCatalogoSelector";

export default function ServiciosAdicionalesForm() {
  const { data } = useAppData();
  const patenteRef = useRef<HTMLInputElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const vehiculoRef = useRef<HTMLInputElement>(null);
  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const detallePersonalizadoRef = useRef<HTMLInputElement>(null);

  const r = useServiciosAdicionalesForm({
    patenteRef,
    nombreRef,
    telefonoRef,
    emailRef,
    vehiculoRef,
    razonSocialRef,
    rutRef,
    direccionRef,
    giroRef,
    notasRef,
    detallePersonalizadoRef,
  });

  return (
    <div className="scan-panel" style={{ textAlign: "left" }}>
      <h2 style={{ textAlign: "center", textTransform: "uppercase" }}>Registrar servicio adicional</h2>

      {r.patenteBuscada === null ? (
        <>
          <div className="field">
            <label>Patente</label>
            <input
              ref={patenteRef}
              style={{ textTransform: "uppercase" }}
              placeholder="AB1234"
              maxLength={8}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") r.buscarPatente();
              }}
            />
          </div>
          <div className="err">{r.err}</div>
          <button className="btn" onClick={r.buscarPatente}>
            Buscar
          </button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <span className="plate-tag" style={{ fontSize: 18 }}>
              {r.patenteBuscada}
            </span>
            {r.clienteExistente ? (
              <span className="status-pill ok">Cliente existente</span>
            ) : (
              <span className="status-pill warn">Cliente nuevo</span>
            )}
            <button className="btn ghost" style={{ marginTop: 0, marginLeft: "auto" }} onClick={r.cambiarPatente}>
              Cambiar patente
            </button>
          </div>

          <ServicioCatalogoSelector {...r.seleccion} precios={data.precios} detallePersonalizadoRef={detallePersonalizadoRef} />

          {r.seleccion.lineas.length > 0 && (
            <DetailList className="mb-4">
              {r.seleccion.lineas.map((l) => (
                <DetailRow key={l.id} label={l.nombre} value={fmtCLP(l.precio)} />
              ))}
              <DetailRow label="Total" value={fmtCLP(r.seleccion.totalListado)} valueClassName="text-primary text-base font-bold" />
            </DetailList>
          )}

          <div key={r.patenteBuscada}>
            <div className="field">
              <label>Nombre</label>
              <input ref={nombreRef} defaultValue={r.clienteExistente?.nombre || ""} placeholder="Nombre completo" />
            </div>
            <div className="field">
              <label>Teléfono *</label>
              <input
                ref={telefonoRef}
                required
                defaultValue={r.clienteExistente?.telefono ? fmtTelefono(r.clienteExistente.telefono) : "+569"}
                placeholder="+569 -1111 1111"
                onBlur={r.onTelefonoBlur}
              />
            </div>
            <div className="field">
              <label>Correo electrónico *</label>
              <input ref={emailRef} type="email" required defaultValue={r.clienteExistente?.email || ""} placeholder="correo@ejemplo.com" />
            </div>
            <div className="field">
              <label>Vehículo (Marca y Modelo) *</label>
              <input ref={vehiculoRef} required defaultValue={r.clienteExistente?.vehiculo || ""} placeholder="Ej: Toyota Yaris" />
            </div>
            <div className="field">
              <label>Tipo de documento</label>
              <select value={r.tipoDoc} onChange={(e) => r.setTipoDoc(e.target.value as "Boleta" | "Factura")}>
                <option value="Boleta">Boleta</option>
                <option value="Factura">Factura</option>
              </select>
            </div>
            {r.tipoDoc === "Factura" && (
              <div>
                <div className="field">
                  <label>RUT</label>
                  <input ref={rutRef} defaultValue={r.clienteExistente?.rut || ""} placeholder="12.345.678-9" onBlur={r.onRutBlur} />
                </div>
                <div className="field">
                  <label>Razón Social</label>
                  <input ref={razonSocialRef} defaultValue={r.clienteExistente?.razonSocial || ""} />
                </div>
                <div className="field">
                  <label>Dirección</label>
                  <input ref={direccionRef} defaultValue={r.clienteExistente?.direccion || ""} />
                </div>
                <div className="field">
                  <label>Giro</label>
                  <input ref={giroRef} defaultValue={r.clienteExistente?.giro || ""} />
                </div>
              </div>
            )}
            {r.seleccion.lineas.length > 0 && (
              <div className="field">
                <label>Fecha y hora de Inicio{r.horarioConfigurado ? " *" : ""}</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input type="date" min={todayYMD()} value={r.fechaCita} onChange={(e) => r.setFechaCita(e.target.value)} style={{ flex: 1 }} />
                  <input type="time" value={r.horaCita} onChange={(e) => r.setHoraCita(e.target.value)} style={{ flex: 1 }} />
                </div>
                <div className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                  {r.horarioConfigurado
                    ? `Duración estimada: ${r.duracionCita} min. Se agenda en la Agenda del negocio.`
                    : "Configura el horario de atención en Administrador de ingresos → Agenda para validar disponibilidad automáticamente."}
                </div>
              </div>
            )}
            {r.seleccion.lineas.length > 0 && (
              <div className="field">
                <label>Fecha y hora de Entrega</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="date"
                    min={r.fechaCita}
                    value={r.fechaEntregaCampo || r.fechaCita}
                    onChange={(e) => {
                      r.setFechaEntregaManual(e.target.value);
                      r.setEntregaEditadaManualmente(true);
                    }}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="time"
                    value={r.horaEntregaCampo}
                    onChange={(e) => {
                      r.setHoraEntregaManual(e.target.value);
                      r.setEntregaEditadaManualmente(true);
                    }}
                    style={{ flex: 1 }}
                  />
                </div>
                <div className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                  {r.horaCita && !r.entregaEditadaManualmente
                    ? `Calculada automáticamente (Inicio + ${r.duracionCita} min). Puedes ajustarla manualmente.`
                    : "Cuándo estará listo el vehículo para el cliente. No reserva hora en la Agenda."}
                </div>
              </div>
            )}
            <div className="field">
              <label>Notas / Observaciones</label>
              <textarea ref={notasRef} rows={3} placeholder="Observaciones de quien recibe el vehículo..." />
            </div>
          </div>

          <div className="field">
            <label>Estado de pago</label>
            <div className="estado-pago-grid">
              <button
                type="button"
                className={`estado-pago-btn ok${r.estadoPago === "pagado" ? " selected" : ""}`}
                onClick={() => {
                  r.setEstadoPago("pagado");
                  r.setErr("");
                }}
              >
                Pagado 100%
              </button>
              <button
                type="button"
                className={`estado-pago-btn warn${r.estadoPago === "abono50" ? " selected" : ""}`}
                onClick={() => {
                  r.setEstadoPago("abono50");
                  if (!r.montoAbonoTexto) r.setMontoAbonoTexto(String(r.montoAbonoMinimo));
                  r.setErr("");
                }}
              >
                Abono (mín. 50%)
              </button>
            </div>
            {r.estadoPago === "abono50" && (
              <div style={{ marginBottom: 8 }}>
                <PriceInput
                  value={r.montoAbonoTexto}
                  onChange={r.setMontoAbonoTexto}
                  placeholder="Monto abonado"
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--white)",
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
                <div className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                  Mínimo exigido: {fmtCLP(r.montoAbonoMinimo)} (50% de {fmtCLP(r.seleccion.totalListado)})
                </div>
              </div>
            )}
            {r.estadoPago && (
              <div style={{ marginTop: -4, marginBottom: 8, fontSize: 13, color: "var(--gray)" }}>
                Se cobra ahora: <strong style={{ color: "var(--gold)" }}>{fmtCLP(r.montoCobradoTotal)}</strong>
                {r.estadoPago === "abono50" ? ` de ${fmtCLP(r.seleccion.totalListado)}` : ""}
              </div>
            )}
          </div>

          {r.estadoPago && (
            <div className="field">
              <label>Forma de pago</label>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className={r.metodoPago === "efectivo" ? "btn" : "btn ghost"}
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => {
                    r.setMetodoPago("efectivo");
                    r.setErr("");
                  }}
                >
                  Efectivo
                </button>
                <button
                  type="button"
                  className={r.metodoPago === "tarjeta" ? "btn" : "btn ghost"}
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => {
                    r.setMetodoPago("tarjeta");
                    r.setErr("");
                  }}
                >
                  Tarjeta
                </button>
                <button
                  type="button"
                  className={r.metodoPago === "transferencia" ? "btn" : "btn ghost"}
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => {
                    r.setMetodoPago("transferencia");
                    r.setErr("");
                  }}
                >
                  Transferencia bancaria
                </button>
              </div>
              {r.metodoPago === "transferencia" && <DatosTransferencia />}
            </div>
          )}

          <div className="err">{r.err}</div>
          <button className="btn" onClick={r.registrar} disabled={r.guardando}>
            {r.guardando ? "Guardando…" : "Registrar servicio"}
          </button>
        </>
      )}
    </div>
  );
}
