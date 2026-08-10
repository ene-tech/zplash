"use client";

import { useState } from "react";
import { fmtCLP, formatRut, isValidEmail, isValidPatente, isValidRut, normPlate } from "@/lib/helpers";
import type { DatosDocumento, TipoPago } from "./usePagarForm";

type Paso = "patente" | "documento";

// Tarjeta de pago directo para un ítem sin búsqueda previa (viene de un
// link con ?item=lavado_unico o ?item=aspirado): primero pide la patente,
// después si quiere boleta o factura (y si es factura, los datos de la
// empresa), y recién ahí cobra ese único ítem. Mismos campos/columnas que ya
// usa Venta Empresa (ver pagosWebpayItems), pero acá el correo solo se pide
// si eligen Factura.
export function PagoUnicoCard({
  icono,
  titulo,
  precio,
  tipo,
  patente,
  setPatente,
  err,
  pagando,
  onPagar,
}: {
  icono: string;
  titulo: string;
  precio: number;
  tipo: TipoPago;
  patente: string;
  setPatente: (v: string) => void;
  err: string;
  pagando: string | null;
  onPagar: (tipo: TipoPago, datosDocumento: DatosDocumento) => void;
}) {
  const [paso, setPaso] = useState<Paso>("patente");
  const [tipoDocumento, setTipoDocumento] = useState<DatosDocumento["tipoDocumento"]>("Boleta");
  const [razonSocial, setRazonSocial] = useState("");
  const [rut, setRut] = useState("");
  const [direccion, setDireccion] = useState("");
  const [giro, setGiro] = useState("");
  const [email, setEmail] = useState("");
  const [errPaso, setErrPaso] = useState("");

  function continuar() {
    if (!isValidPatente(normPlate(patente))) {
      setErrPaso("Patente inválida. Ej: AB1234 o ABCD12.");
      return;
    }
    setErrPaso("");
    setPaso("documento");
  }

  function pagar() {
    if (tipoDocumento === "Factura") {
      if (!razonSocial.trim() || !rut.trim() || !direccion.trim() || !giro.trim() || !email.trim()) {
        setErrPaso("Completa Razón Social, RUT, Giro, Dirección y Correo para la factura.");
        return;
      }
      if (!isValidRut(rut)) {
        setErrPaso("RUT inválido. Ej: 12.345.678-9");
        return;
      }
      if (!isValidEmail(email)) {
        setErrPaso("Correo inválido.");
        return;
      }
    }
    setErrPaso("");
    onPagar(
      tipo,
      tipoDocumento === "Factura"
        ? {
            tipoDocumento,
            razonSocial: razonSocial.trim(),
            rut: formatRut(rut),
            direccion: direccion.trim(),
            giro: giro.trim(),
            email: email.trim().toLowerCase(),
          }
        : { tipoDocumento }
    );
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <p style={{ color: "var(--gray)", fontSize: 13.5, marginBottom: 6 }}>Vas a pagar:</p>
      <h3 style={{ marginBottom: 10 }}>
        {icono} {titulo}
      </h3>
      <div className="price-row" style={{ marginBottom: 14 }}>
        <span className="new">{fmtCLP(precio)}</span>
      </div>

      {paso === "patente" ? (
        <>
          <input
            className="plate-input"
            value={patente}
            onChange={(e) => setPatente(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && continuar()}
            placeholder="AB1234"
            maxLength={6}
            style={{ marginBottom: 10 }}
          />
          <div className="err">{errPaso || err}</div>
          <button className="btn" onClick={continuar}>
            Continuar
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label>Patente</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="plate-tag">{normPlate(patente)}</span>
              <button
                type="button"
                className="btn ghost"
                style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }}
                onClick={() => setPaso("patente")}
              >
                Cambiar
              </button>
            </div>
          </div>
          <div className="field">
            <label>Tipo de documento</label>
            <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as DatosDocumento["tipoDocumento"])}>
              <option value="Boleta">Boleta</option>
              <option value="Factura">Factura</option>
            </select>
          </div>

          {tipoDocumento === "Factura" && (
            <div>
              <div className="field">
                <label>Razón Social</label>
                <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
              </div>
              <div className="field">
                <label>RUT</label>
                <input
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                  onBlur={() => setRut((r) => (isValidRut(r) ? formatRut(r) : r))}
                  placeholder="12.345.678-9"
                />
              </div>
              <div className="field">
                <label>Giro</label>
                <input value={giro} onChange={(e) => setGiro(e.target.value)} />
              </div>
              <div className="field">
                <label>Dirección</label>
                <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
              </div>
              <div className="field">
                <label>Correo para recibir la factura</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@empresa.cl" />
              </div>
            </div>
          )}

          <div className="err">{errPaso || err}</div>
          <button className="btn" onClick={pagar} disabled={pagando !== null}>
            {pagando === tipo ? "Redirigiendo..." : "Pagar ahora"}
          </button>
        </>
      )}
    </div>
  );
}
