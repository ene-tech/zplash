"use client";

import { useRef } from "react";
import { useAppData } from "@/context/AppContext";
import { beneficioCupon, fmtCLP } from "@/lib/helpers";
import { useOperadorNotFoundResult } from "@/components/operador/useOperadorNotFoundResult";

export default function OperadorNotFoundResult({
  plate,
  clearPlate,
  codigoDescuento,
}: {
  plate: string;
  clearPlate: () => void;
  codigoDescuento?: string;
}) {
  const { patchUi, guardando } = useAppData();
  const qNombreRef = useRef<HTMLInputElement>(null);
  const qTelefonoRef = useRef<HTMLInputElement>(null);
  const qEmailRef = useRef<HTMLInputElement>(null);
  const qVehiculoRef = useRef<HTMLInputElement>(null);
  const qRazonSocialRef = useRef<HTMLInputElement>(null);
  const qRutRef = useRef<HTMLInputElement>(null);
  const qDireccionRef = useRef<HTMLInputElement>(null);
  const qGiroRef = useRef<HTMLInputElement>(null);
  const qCuponRef = useRef<HTMLInputElement>(null);

  const r = useOperadorNotFoundResult(plate, clearPlate, codigoDescuento, {
    qNombreRef,
    qTelefonoRef,
    qEmailRef,
    qVehiculoRef,
    qRazonSocialRef,
    qRutRef,
    qDireccionRef,
    qGiroRef,
    qCuponRef,
  });

  return (
    <div className="result-card notfound">
      <div className="result-head">
        <h3>Patente no registrada</h3>
        <span className="status-pill bad">{plate.toUpperCase()}</span>
      </div>
      {r.err && <div className="err" style={{ marginBottom: 10 }}>{r.err}</div>}
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13 }}>
        Este vehículo no tiene un plan activo. Elige el tipo de lavado:
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          className={r.tipoLavado === "plan" ? "btn" : "btn secondary"}
          style={{ marginTop: 0, flex: "1 1 160px" }}
          onClick={() => r.setTipoLavado("plan")}
        >
          Renovar / Contratar plan
        </button>
        <button
          className={r.tipoLavado === "unico" ? "btn" : "btn secondary"}
          style={{ marginTop: 0, flex: "1 1 160px" }}
          onClick={() => r.setTipoLavado("unico")}
        >
          Lavado Full Túnel ({fmtCLP(r.precioConDescuento ?? r.precioBaseLavado)})
        </button>
      </div>
      <div className="quick-form" style={{ marginBottom: r.cuponPrevio ? 4 : 14, marginTop: 0 }}>
        <div>
          <label>Código de descuento (opcional)</label>
          <input
            ref={qCuponRef}
            placeholder="Ej: AB12CD"
            defaultValue={codigoDescuento || ""}
            onChange={(e) => r.setCodigoInput(e.target.value)}
            style={{ textTransform: "uppercase" }}
          />
        </div>
      </div>
      {r.cuponPrevio && (
        <div className="hint" style={{ textAlign: "left", color: "var(--green)", fontSize: 13, marginBottom: 14 }}>
          Beneficio: {beneficioCupon(r.cuponPrevio)}.
          Lavado Full Túnel queda en {fmtCLP(r.precioConDescuento!)} (antes {fmtCLP(r.precioBaseLavado)}).
        </div>
      )}
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginTop: 14 }}>
        Registra un cliente rápido. Los campos con * son obligatorios.
      </div>
      <div className="quick-form">
        <div>
          <label>Nombre *</label>
          <input ref={qNombreRef} placeholder="Nombre del cliente" />
        </div>
        <div>
          <label>Teléfono *</label>
          <input ref={qTelefonoRef} defaultValue="+569" placeholder="+569 -1111 1111" onBlur={r.onTelefonoBlur} />
        </div>
        <div>
          <label>Correo electrónico{r.tipoLavado === "plan" && !r.sinCorreo ? " *" : ""}</label>
          <input ref={qEmailRef} type="email" placeholder="correo@ejemplo.com" disabled={r.sinCorreo} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontWeight: 400 }}>
            <input type="checkbox" checked={r.sinCorreo} onChange={(e) => r.setSinCorreo(e.target.checked)} style={{ width: "auto" }} />
            El cliente no quiere dar correo
          </label>
        </div>
        <div>
          <label>Vehículo (Marca y Modelo)</label>
          <input ref={qVehiculoRef} placeholder="Ej: Toyota Yaris" />
        </div>
        <div>
          <label>Tipo de documento</label>
          <select value={r.tipoDoc} onChange={(e) => r.setTipoDoc(e.target.value as "Boleta" | "Factura")}>
            <option value="Boleta">Boleta</option>
            <option value="Factura">Factura</option>
          </select>
        </div>
        {r.tipoDoc === "Factura" && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <label>RUT</label>
              <input ref={qRutRef} placeholder="12.345.678-9" onBlur={r.onRutBlur} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Razón Social</label>
              <input ref={qRazonSocialRef} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Dirección</label>
              <input ref={qDireccionRef} />
            </div>
            <div>
              <label>Giro</label>
              <input ref={qGiroRef} />
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn" style={{ marginTop: 0, flex: "2 1 200px" }} onClick={r.quickAdd} disabled={guardando}>
          {guardando ? "Guardando…" : "Registrar cliente"}
        </button>
        <button className="btn ghost" style={{ marginTop: 0, flex: "1 1 120px" }} onClick={() => patchUi({ operResult: null })}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
