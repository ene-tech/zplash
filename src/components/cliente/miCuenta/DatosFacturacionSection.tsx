"use client";

import { useState } from "react";
import { RUT_FORMATO_MSG, formatRut, isValidRut } from "@/lib/helpers";
import type { VehiculoSesion } from "@/lib/sesionCliente";

// "Inscribir empresa" = llenar en el propio Cliente (por patente, ver
// DatosFacturacion en @/types) los mismos 4 campos que en el panel de
// operador/admin llena ClientModal, para que las próximas ventas de ese
// vehículo se emitan con Factura en vez de Boleta (ver
// /api/cliente/mi-cuenta/actualizar-facturacion). Un vehículo = una
// tarjeta, mismo patrón visual que "Tarjetas registradas" — cada tarjeta
// alterna entre mostrar el estado actual y un formulario de edición
// in-place.
export function DatosFacturacionSection({ vehiculos, onActualizado }: { vehiculos: VehiculoSesion[]; onActualizado: () => void }) {
  if (vehiculos.length === 0) return null;

  return (
    <>
      <h3 style={{ marginBottom: 6 }}>Facturación</h3>
      <p style={{ color: "var(--gray)", fontSize: 12.5, marginBottom: 12 }}>
        Por defecto tus compras se emiten con Boleta. Si quieres que se facturen a nombre de una empresa, inscríbela acá.
      </p>
      <div className="card-grid" style={{ marginBottom: 26 }}>
        {vehiculos.map((v) => (
          <FacturacionCard key={v.patente} v={v} onActualizado={onActualizado} />
        ))}
      </div>
    </>
  );
}

function FacturacionCard({ v, onActualizado }: { v: VehiculoSesion; onActualizado: () => void }) {
  const [editando, setEditando] = useState(false);
  const [confirmandoBoleta, setConfirmandoBoleta] = useState(false);
  const [rut, setRut] = useState(v.rut || "");
  const [razonSocial, setRazonSocial] = useState(v.razonSocial || "");
  const [direccion, setDireccion] = useState(v.direccion || "");
  const [giro, setGiro] = useState(v.giro || "");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const tieneFactura = v.tipoDocumento === "Factura";

  const onRutBlur = () => {
    if (isValidRut(rut)) setRut(formatRut(rut));
  };

  async function guardar(tipoDocumento: "Boleta" | "Factura") {
    if (tipoDocumento === "Factura") {
      if (!razonSocial.trim() || !direccion.trim() || !giro.trim()) {
        setError("Completa Razón Social, RUT, Dirección y Giro");
        return;
      }
      if (!isValidRut(rut)) {
        setError(RUT_FORMATO_MSG);
        return;
      }
    }
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/cliente/mi-cuenta/actualizar-facturacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente: v.patente, tipoDocumento, razonSocial, rut, direccion, giro }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el cambio");
        setEnviando(false);
        return;
      }
      setEnviando(false);
      setEditando(false);
      setConfirmandoBoleta(false);
      onActualizado();
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
      setEnviando(false);
    }
  }

  if (editando) {
    return (
      <div className="vehicle-card">
        <span className="plate-tag">{v.patente}</span>
        <div className="field" style={{ marginTop: 10 }}>
          <label>RUT empresa</label>
          <input value={rut} onChange={(e) => setRut(e.target.value)} onBlur={onRutBlur} placeholder="12.345.678-9" />
        </div>
        <div className="field">
          <label>Razón Social</label>
          <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
        </div>
        <div className="field">
          <label>Giro</label>
          <input value={giro} onChange={(e) => setGiro(e.target.value)} />
        </div>
        <div className="field">
          <label>Dirección</label>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </div>
        {error && <div className="err">{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }} onClick={() => guardar("Factura")} disabled={enviando}>
            {enviando ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }}
            onClick={() => {
              setEditando(false);
              setError("");
            }}
            disabled={enviando}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vehicle-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="plate-tag">{v.patente}</span>
        <span className={`status-pill ${tieneFactura ? "ok" : "warn"}`}>{tieneFactura ? "Factura" : "Boleta"}</span>
      </div>
      {tieneFactura ? (
        <>
          <div className="plan-nombre">{v.razonSocial}</div>
          <div style={{ color: "var(--gray)", fontSize: 12.5 }}>{v.rut}</div>
        </>
      ) : (
        <div style={{ color: "var(--gray)", fontSize: 12.5, marginTop: 6 }}>Sin empresa inscrita.</div>
      )}
      {error && !confirmandoBoleta && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }}
          onClick={() => {
            setError("");
            setEditando(true);
          }}
        >
          {tieneFactura ? "Editar datos" : "Inscribir empresa"}
        </button>
        {tieneFactura && (
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }}
            onClick={() => setConfirmandoBoleta(true)}
          >
            Volver a boleta
          </button>
        )}
      </div>

      {confirmandoBoleta && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3>Volver a Boleta</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              Se quitará la empresa inscrita para <strong>{v.patente}</strong>: tus próximas compras volverán a emitirse con Boleta.
            </div>
            {error && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmandoBoleta(false)} disabled={enviando}>
                Cancelar
              </button>
              <button type="button" className="btn danger" onClick={() => guardar("Boleta")} disabled={enviando}>
                {enviando ? "Guardando..." : "Sí, volver a boleta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
