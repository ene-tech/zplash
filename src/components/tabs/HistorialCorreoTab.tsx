"use client";

import { useEffect, useState } from "react";
import { listarHistorialReglasCorreo } from "@/lib/serverActions";
import { fmtFecha, fmtHora } from "@/lib/helpers";
import type { EstadoDisparoReglaCorreo, HistorialReglaCorreo, OrigenTipoDisparoReglaCorreo } from "@/types";

const ETIQUETA_ORIGEN: Record<OrigenTipoDisparoReglaCorreo, string> = {
  venta: "Venta",
  cobro: "Cobro",
  cliente: "Vencimiento / migración",
};

const COLOR_ESTADO: Record<EstadoDisparoReglaCorreo, string> = {
  enviado: "var(--green)",
  error: "var(--red)",
  programado: "var(--gray)",
};

const ETIQUETA_ESTADO: Record<EstadoDisparoReglaCorreo, string> = {
  enviado: "Enviado",
  error: "Error",
  programado: "Programado",
};

function EstadoBadge({ estado }: { estado: EstadoDisparoReglaCorreo }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        color: "#fff",
        background: COLOR_ESTADO[estado],
      }}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

// Historial de envíos de correo (Web Settings → Historial Correo) — mismo
// propósito que HistorialWhatsappTab, sin el resumen de gasto (Resend no
// cobra por mensaje individual igual que la Graph API de Meta, no aplica el
// mismo cálculo).
export default function HistorialCorreoTab() {
  const [filas, setFilas] = useState<HistorialReglaCorreo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [soloErrores, setSoloErrores] = useState(false);

  const cargar = async () => {
    setCargando(true);
    setFilas(await listarHistorialReglasCorreo());
    setCargando(false);
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const rows = await listarHistorialReglasCorreo();
      if (!cancelado) {
        setFilas(rows);
        setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const visibles = soloErrores ? filas.filter((f) => f.estado === "error") : filas;
  const totalErrores = filas.filter((f) => f.estado === "error").length;

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Cada vez que una Regla Correo se dispara (venta, cobro fallido, vencimiento o campaña de migración WooCommerce)
        queda una fila acá: a quién y si el envío terminó en éxito o en error (con el motivo real, si el proveedor lo
        entregó).
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn" style={{ marginTop: 0 }} onClick={cargar} disabled={cargando}>
          {cargando ? "Cargando..." : "Actualizar"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
          <input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} />
          Solo errores {totalErrores ? `(${totalErrores})` : ""}
        </label>
      </div>

      {!cargando && visibles.length === 0 && (
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)" }}>
          {soloErrores ? "Sin errores registrados." : "Todavía no se ha disparado ninguna regla."}
        </div>
      )}

      {visibles.map((f) => (
        <div key={f.id} className="vehicle-card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>{f.reglaNombre}</span>
            <EstadoBadge estado={f.estado} />
            <span className="hint" style={{ margin: 0, fontSize: 12, color: "var(--gray)" }}>
              {ETIQUETA_ORIGEN[f.origenTipo]}
            </span>
          </div>
          <div className="hint" style={{ textAlign: "left", fontSize: 13, margin: "0 0 4px" }}>
            {f.clienteNombre || "(cliente eliminado)"} {f.patente ? `· ${f.patente}` : ""} · {fmtFecha(f.creadoEn)} {fmtHora(f.creadoEn)}
          </div>
          {f.error && (
            <div className="err" style={{ textAlign: "left", margin: "4px 0 0", fontSize: 12 }}>
              {f.error}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
