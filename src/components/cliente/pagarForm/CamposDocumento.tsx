"use client";

import type { DatosDocumento } from "./usePagarForm";
import type { DatosDocumentoForm } from "./useDatosDocumento";

// Selector Boleta/Factura + campos de la empresa (solo si Factura): mismo
// bloque de UI usado por PagoUnicoCard, el paso "documento" de
// Plan/Renovación (ver ResultadoBusqueda) y Servicios puntuales (ver
// ServicioDocumentoCard) — ver useDatosDocumento para el estado/validación.
export function CamposDocumento({ d, emailLabel }: { d: DatosDocumentoForm; emailLabel?: string }) {
  return (
    <>
      <div className="field">
        <label>Tipo de documento</label>
        <select value={d.tipoDocumento} onChange={(e) => d.setTipoDocumento(e.target.value as DatosDocumento["tipoDocumento"])}>
          <option value="Boleta">Boleta</option>
          <option value="Factura">Factura</option>
        </select>
      </div>

      {d.tipoDocumento === "Factura" && (
        <div>
          <div className="field">
            <label>Razón Social</label>
            <input value={d.razonSocial} onChange={(e) => d.setRazonSocial(e.target.value)} />
          </div>
          <div className="field">
            <label>RUT</label>
            <input value={d.rut} onChange={(e) => d.setRut(e.target.value)} onBlur={d.onRutBlur} placeholder="12.345.678-9" />
          </div>
          <div className="field">
            <label>Giro</label>
            <input value={d.giro} onChange={(e) => d.setGiro(e.target.value)} />
          </div>
          <div className="field">
            <label>Dirección</label>
            <input value={d.direccion} onChange={(e) => d.setDireccion(e.target.value)} />
          </div>
          <div className="field">
            <label>{emailLabel || "Correo para recibir la factura"}</label>
            <input type="email" value={d.email} onChange={(e) => d.setEmail(e.target.value)} placeholder="tucorreo@empresa.cl" />
          </div>
        </div>
      )}
    </>
  );
}
