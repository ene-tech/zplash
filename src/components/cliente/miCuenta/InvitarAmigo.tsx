"use client";

import { useState } from "react";
import { fmtCLP } from "@/lib/helpers";

// Programa de referidos (ver @/lib/referidos): el link lleva la patente del
// cliente, el amigo recibe el descuento de bienvenida y, cuando lo usa, el
// cron /api/referidos/premiar le deja a este cliente un descuento igual atado
// a esa misma patente. Por eso con varios autos se elige a cuál va el premio.
export function InvitarAmigo({ patentes, valor }: { patentes: string[]; valor: number }) {
  const [patente, setPatente] = useState(patentes[0] || "");
  const [copiado, setCopiado] = useState(false);

  if (!patentes.length || !valor) return null;

  const link = `${window.location.origin}/?ref=${encodeURIComponent(patente)}`;
  const mensaje = `Te regalo ${fmtCLP(valor)} de descuento en tu primer lavado en ZPlash: ${link}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles: el link igual queda a la vista para copiarlo a mano.
    }
  }

  return (
    <div className="card" style={{ marginBottom: 26 }}>
      <h3 style={{ marginTop: 0 }}>Regala {fmtCLP(valor)}, gana {fmtCLP(valor)}</h3>
      <p style={{ fontSize: 14, color: "var(--gray)" }}>
        Comparte tu link: tu amigo recibe {fmtCLP(valor)} de descuento en su primer lavado y, cuando lo use, te dejamos{" "}
        {fmtCLP(valor)} de descuento a ti para tu próximo pago. Si invitas a varios, ganas un descuento por cada amigo y se usa
        uno por visita.
      </p>
      {patentes.length > 1 && (
        <div className="field">
          <label htmlFor="referido-patente">Tu descuento va a la patente</label>
          <select id="referido-patente" value={patente} onChange={(e) => setPatente(e.target.value)}>
            {patentes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="plate-tag" style={{ wordBreak: "break-all", fontSize: 13 }}>
        {link}
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer">
          Enviar por WhatsApp
        </a>
        <button type="button" className="btn ghost" onClick={copiar}>
          {copiado ? "¡Copiado!" : "Copiar link"}
        </button>
      </div>
    </div>
  );
}
