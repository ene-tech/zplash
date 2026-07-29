"use client";

import { useEffect, useState } from "react";
import { contarMensajesWhatsappGenerados, listarHistorialReglasWhatsapp } from "@/lib/serverActions";
import { fmtCLP, fmtFecha, fmtHora, primerDiaMesActualYMD, todayYMD } from "@/lib/helpers";
import type { EstadoDisparoReglaWhatsapp, HistorialReglaWhatsapp, OrigenTipoDisparoReglaWhatsapp } from "@/types";

// Costo por mensaje que cobra Meta (varía por tipo de plantilla/país, pero
// hoy todas las que usamos caen en la misma categoría) y tipo de cambio de
// referencia — editable en el input porque el dólar se mueve día a día y acá
// solo interesa una estimación, no el valor exacto de cada transacción.
const COSTO_MENSAJE_USD = 0.08;
const TIPO_CAMBIO_CLP_DEFAULT = 940;

// Resumen de gasto (Web Settings → Historial WhatsApp): cuenta los mensajes
// "generados por nosotros" (reglas + Mensajes Únicos + respuestas manuales
// del inbox) en el período elegido — no las respuestas automáticas del bot
// por menú, que no tienen costo relevante para este seguimiento. Ver
// contarMensajesWhatsappGenerados en @/lib/dataAccess/whatsapp/gasto.
function GastoWhatsappResumen() {
  const [desde, setDesde] = useState(primerDiaMesActualYMD());
  const [hasta, setHasta] = useState(todayYMD());
  const [tipoCambio, setTipoCambio] = useState(TIPO_CAMBIO_CLP_DEFAULT);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setTotal(null);
      const n = await contarMensajesWhatsappGenerados(`${desde}T00:00:00`, `${hasta}T23:59:59.999`);
      if (!cancelado) setTotal(n);
    })();
    return () => {
      cancelado = true;
    };
  }, [desde, hasta]);

  const totalUsd = (total ?? 0) * COSTO_MENSAJE_USD;
  const totalClp = totalUsd * tipoCambio;

  return (
    <div className="vehicle-card" style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Gasto en mensajes WhatsApp</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Desde</label>
          <input type="date" value={desde} style={{ maxWidth: 170 }} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Hasta</label>
          <input type="date" value={hasta} style={{ maxWidth: 170 }} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <button
          className="btn ghost"
          style={{ alignSelf: "flex-end" }}
          onClick={() => {
            setDesde(primerDiaMesActualYMD());
            setHasta(todayYMD());
          }}
        >
          Mes actual
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Dólar (CLP)</label>
          <input
            type="number"
            value={tipoCambio}
            style={{ maxWidth: 100 }}
            onChange={(e) => setTipoCambio(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      {total === null ? (
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)" }}>
          Calculando...
        </div>
      ) : (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="num">{total}</div>
            <div className="lbl">Mensajes generados por nosotros</div>
          </div>
          <div className="stat-card">
            <div className="num">US$ {totalUsd.toFixed(2)}</div>
            <div className="lbl">Costo estimado (US$0,08 c/u)</div>
          </div>
          <div className="stat-card ok">
            <div className="num">{fmtCLP(totalClp)}</div>
            <div className="lbl">Costo estimado en CLP</div>
          </div>
        </div>
      )}
      <div className="hint" style={{ textAlign: "left", fontSize: 12, color: "var(--gray)", margin: "8px 0 0" }}>
        Incluye Reglas WhatsApp y Mensajes Únicos; no incluye las respuestas automáticas del bot por menú.
      </div>
    </div>
  );
}

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
      <GastoWhatsappResumen />

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
