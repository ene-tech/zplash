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
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 14px" }}>
        <Billete etiqueta="Regalas" valor={valor} />
        <span aria-hidden style={{ fontSize: 22, fontWeight: 800, color: "#1f7a3d" }}>
          →
        </span>
        <Billete etiqueta="Ganas" valor={valor} />
      </div>
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

// Billete verde dibujado con CSS: marco, valor en las esquinas, sello central y
// un trama de líneas finas para que se lea como plata/descuento a primera vista.
function Billete({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  const monto = fmtCLP(valor);
  const esquina = { position: "absolute" as const, fontSize: 10, fontWeight: 800, color: "#d9f5df", lineHeight: 1 };
  return (
    <div
      role="img"
      aria-label={`${etiqueta} ${monto} de descuento`}
      style={{
        flex: 1,
        minWidth: 0,
        position: "relative",
        aspectRatio: "2 / 1",
        maxHeight: 96,
        borderRadius: 8,
        padding: 5,
        background: "linear-gradient(135deg, #2e9a4f 0%, #1f7a3d 55%, #17602f 100%)",
        boxShadow: "0 3px 10px rgba(23, 96, 47, 0.35)",
        transform: etiqueta === "Ganas" ? "rotate(2deg)" : "rotate(-2deg)",
      }}
    >
      <div
        style={{
          position: "relative",
          height: "100%",
          borderRadius: 5,
          border: "1.5px dashed rgba(217, 245, 223, 0.7)",
          background:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 7px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 7px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <span style={{ ...esquina, top: 4, left: 5 }}>{monto}</span>
        <span style={{ ...esquina, bottom: 4, right: 5 }}>{monto}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#d9f5df" }}>
          {etiqueta}
        </span>
        <span style={{ fontSize: "clamp(20px, 6vw, 28px)", fontWeight: 900, lineHeight: 1.05, textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
          {monto}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#d9f5df" }}>DESCUENTO</span>
      </div>
    </div>
  );
}
