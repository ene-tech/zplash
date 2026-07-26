"use client";

import { fmtCLP } from "@/lib/helpers";
import type { TipoPago } from "./usePagarForm";

// Tarjeta de pago directo para un ítem sin búsqueda previa (viene de un
// link con ?item=lavado_unico o ?item=aspirado): solo pide la patente y
// cobra ese único ítem.
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
  onPagar: (tipo: TipoPago) => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <p style={{ color: "var(--gray)", fontSize: 13.5, marginBottom: 6 }}>Vas a pagar:</p>
      <h3 style={{ marginBottom: 10 }}>
        {icono} {titulo}
      </h3>
      <div className="price-row" style={{ marginBottom: 14 }}>
        <span className="new">{fmtCLP(precio)}</span>
      </div>
      <input
        className="plate-input"
        value={patente}
        onChange={(e) => setPatente(e.target.value.toUpperCase())}
        placeholder="AB1234"
        maxLength={6}
        style={{ marginBottom: 10 }}
      />
      <div className="err">{err}</div>
      <button className="btn" onClick={() => onPagar(tipo)} disabled={pagando !== null}>
        {pagando === tipo ? "Redirigiendo..." : "Pagar ahora"}
      </button>
    </div>
  );
}
