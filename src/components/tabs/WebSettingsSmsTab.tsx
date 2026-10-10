"use client";

import { useEffect, useState } from "react";
import { listarUltimosSms, resumenSmsPorCampana, saldoSms } from "@/lib/serverActions";
import { fmtCLP, fmtFecha, fmtHora, primerDiaMesActualYMD, todayYMD } from "@/lib/helpers";
import type { ResumenSmsCampana, SaldoSms, SmsEnviado } from "@/types";

// Lo que cuesta cada SMS (segmento): recarga de LabsMobile de oct-2026,
// $62.352 por 1.328,57 créditos ($46,93 el crédito) a 0,266 créditos por SMS
// a Chile = $12,48. Si una recarga sale a otro precio, se cambia acá.
const COSTO_SMS_CLP = 12.48;

const COLOR_ESTADO: Record<SmsEnviado["estado"], string> = { enviado: "var(--green)", fallido: "var(--red)", pendiente: "var(--gray)" };

function nombreCampana(c: ResumenSmsCampana): string {
  if (c.regla) return `Regla: ${c.regla}`;
  return c.campana.startsWith("regla:") ? "Regla (borrada)" : `Campaña: ${c.campana}`;
}

function SaldoLabsMobile() {
  const [saldo, setSaldo] = useState<SaldoSms | null>(null);

  useEffect(() => {
    let cancelado = false;
    saldoSms().then((s) => !cancelado && setSaldo(s));
    return () => {
      cancelado = true;
    };
  }, []);

  if (!saldo) return <div className="hint" style={{ textAlign: "left", color: "var(--gray)" }}>Consultando saldo...</div>;
  if ("error" in saldo) return <div className="err" style={{ textAlign: "left" }}>No se pudo leer el saldo de LabsMobile: {saldo.error}</div>;
  const disponibles = Math.floor(saldo.creditos / saldo.creditosPorSms);
  return (
    <div className="stat-grid">
      <div className={`stat-card ${disponibles < 100 ? "" : "ok"}`}>
        <div className="num">{disponibles.toLocaleString("es-CL")}</div>
        <div className="lbl">SMS disponibles en LabsMobile</div>
      </div>
      <div className="stat-card">
        <div className="num">{fmtCLP(disponibles * COSTO_SMS_CLP)}</div>
        <div className="lbl">Saldo en pesos (aprox.)</div>
      </div>
    </div>
  );
}

function GastoSms() {
  const [desde, setDesde] = useState(primerDiaMesActualYMD());
  const [hasta, setHasta] = useState(todayYMD());
  const [filas, setFilas] = useState<ResumenSmsCampana[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setFilas(null);
      const rows = await resumenSmsPorCampana(`${desde}T00:00:00`, `${hasta}T23:59:59.999`);
      if (!cancelado) setFilas(rows);
    })();
    return () => {
      cancelado = true;
    };
  }, [desde, hasta]);

  const enviados = filas?.reduce((s, f) => s + f.enviados, 0) ?? 0;
  const segmentos = filas?.reduce((s, f) => s + f.segmentos, 0) ?? 0;
  const fallidos = filas?.reduce((s, f) => s + f.fallidos, 0) ?? 0;

  return (
    <>
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
      </div>
      {filas === null ? (
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)" }}>
          Calculando...
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="num">{enviados.toLocaleString("es-CL")}</div>
              <div className="lbl">SMS enviados</div>
            </div>
            <div className="stat-card">
              <div className="num">{segmentos.toLocaleString("es-CL")}</div>
              <div className="lbl">SMS cobrados (un texto largo cuenta 2)</div>
            </div>
            <div className="stat-card ok">
              <div className="num">{fmtCLP(segmentos * COSTO_SMS_CLP)}</div>
              <div className="lbl">Gasto (${String(COSTO_SMS_CLP).replace(".", ",")} c/u)</div>
            </div>
            {fallidos > 0 && (
              <div className="stat-card">
                <div className="num">{fallidos}</div>
                <div className="lbl">Fallidos (no se cobran)</div>
              </div>
            )}
          </div>
          {filas.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {filas.map((f) => (
                <div key={f.campana} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span>{nombreCampana(f)}</span>
                  <span style={{ whiteSpace: "nowrap" }}>
                    {f.enviados} SMS · {fmtCLP(f.segmentos * COSTO_SMS_CLP)}
                    {f.fallidos ? ` · ${f.fallidos} fallidos` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function UltimosSms() {
  const [filas, setFilas] = useState<SmsEnviado[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    listarUltimosSms().then((rows) => !cancelado && setFilas(rows));
    return () => {
      cancelado = true;
    };
  }, []);

  if (!filas) return <div className="hint" style={{ textAlign: "left", color: "var(--gray)" }}>Cargando...</div>;
  if (!filas.length) return <div className="hint" style={{ textAlign: "left", color: "var(--gray)" }}>Todavía no se ha enviado ningún SMS.</div>;
  return (
    <>
      {filas.map((m) => (
        <div key={m.id} className="vehicle-card" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: COLOR_ESTADO[m.estado] }}>{m.estado}</span>
            <span>+{m.telefono}</span>
            <span style={{ color: "var(--gray)" }}>
              {fmtFecha(m.creadoEn)} {fmtHora(m.creadoEn)} · {m.campana}
            </span>
          </div>
          <div style={{ fontSize: 13 }}>{m.texto}</div>
          {m.error && <div className="err" style={{ textAlign: "left", margin: "4px 0 0", fontSize: 12 }}>{m.error}</div>}
        </div>
      ))}
    </>
  );
}

// Web Settings → Mensajes de texto: saldo de LabsMobile, gasto por período
// (por campaña y por regla automática) y los últimos SMS enviados. El envío
// masivo está en "Mensajes Únicos" (canal SMS) y las reglas en "Reglas WhatsApp".
export default function WebSettingsSmsTab() {
  return (
    <div>
      <div className="vehicle-card" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Saldo</div>
        <SaldoLabsMobile />
      </div>
      <div className="vehicle-card" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Gasto en SMS</div>
        <GastoSms />
      </div>
      <div style={{ fontWeight: 700, margin: "0 0 10px" }}>Últimos 50 SMS</div>
      <UltimosSms />
    </div>
  );
}
