"use client";

import { useState } from "react";
import { fmtCLP, isValidPatente, normPlate } from "@/lib/helpers";
import { CamposDocumento } from "./CamposDocumento";
import { useDatosDocumento } from "./useDatosDocumento";
import type { DatosDocumento, TipoPago } from "./usePagarForm";

type Paso = "patente" | "documento";

// Tarjeta de pago directo para un ítem sin búsqueda previa (viene de un
// link con ?item=lavado_unico o ?item=aspirado): primero pide la patente,
// después si quiere boleta o factura (y si es factura, los datos de la
// empresa, ver useDatosDocumento), y recién ahí cobra ese único ítem.
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
  const [errPaso, setErrPaso] = useState("");
  const doc = useDatosDocumento();

  function continuar() {
    if (!isValidPatente(normPlate(patente))) {
      setErrPaso("Patente inválida. Ej: AB1234 o ABCD12.");
      return;
    }
    setErrPaso("");
    setPaso("documento");
  }

  function pagar() {
    const datosDocumento = doc.validar();
    if (!datosDocumento) return;
    onPagar(tipo, datosDocumento);
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

          <CamposDocumento d={doc} />

          <div className="err">{doc.error || err}</div>
          <button className="btn" onClick={pagar} disabled={pagando !== null}>
            {pagando === tipo ? "Redirigiendo..." : "Pagar ahora"}
          </button>
        </>
      )}
    </div>
  );
}
