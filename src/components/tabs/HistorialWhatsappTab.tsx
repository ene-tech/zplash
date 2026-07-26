"use client";

import { useEffect, useState } from "react";
import { listarHistorialReglasWhatsapp } from "@/lib/db";
import { fmtFecha, fmtHora } from "@/lib/helpers";
import type { EstadoDisparoReglaWhatsapp, HistorialReglaWhatsapp, OrigenTipoDisparoReglaWhatsapp } from "@/types";

const ETIQUETA_ORIGEN: Record<OrigenTipoDisparoReglaWhatsapp, string> = {
  venta: "Venta",
  ingreso: "Ingreso",
  cobro: "Cobro",
  cliente: "Vencimiento",
};

const COLOR_ESTADO: Record<EstadoDisparoReglaWhatsapp, string> = {
  enviado: "var(--green)",
  error: "var(--red)",
  programado: "var(--gray)",
};

const ETIQUETA_ESTADO: Record<EstadoDisparoReglaWhatsapp, string> = {
  enviado: "Enviado",
  error: "Error",
  programado: "Programado",
};

function EstadoBadge({ estado }: { estado: EstadoDisparoReglaWhatsapp }) {
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

function nombrePlantilla(mensajeTexto?: string): string | undefined {
  const m = mensajeTexto?.match(/^\[Plantilla: (.+)\]$/);
  return m ? m[1] : mensajeTexto;
}

export default function HistorialWhatsappTab() {
  const [filas, setFilas] = useState<HistorialReglaWhatsapp[]>([]);
  const [cargando, setCargando] = useState(true);
  const [soloErrores, setSoloErrores] = useState(false);

  const cargar = async () => {
    setCargando(true);
    setFilas(await listarHistorialReglasWhatsapp());
    setCargando(false);
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const rows = await listarHistorialReglasWhatsapp();
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
        Cada vez que una Regla WhatsApp se dispara (venta, ingreso, cobro fallido o vencimiento próximo) queda una fila
        acá: a quién, qué plantilla, y si el envío a Meta terminó en éxito o en error (con el motivo real, si Meta lo
        entregó). Los mensajes en sí (ida y vuelta con el cliente) están en la sección &quot;Mensajes&quot; del menú principal.
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
          {f.mensajeTexto && (
            <div className="hint" style={{ textAlign: "left", fontSize: 12, color: "var(--gray)", margin: 0 }}>
              Plantilla: {nombrePlantilla(f.mensajeTexto)}
            </div>
          )}
          {f.mensajeError && (
            <div className="err" style={{ textAlign: "left", margin: "4px 0 0", fontSize: 12 }}>
              {f.mensajeError}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
