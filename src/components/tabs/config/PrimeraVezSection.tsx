"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { fmtCLP } from "@/lib/helpers";
import { Gift } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function PrimeraVezSection() {
  const { data, commit } = useAppData();
  const [valorTexto, setValorTexto] = useState(() => String(data.config.descuentoPrimeraVezValor));
  const [diasTexto, setDiasTexto] = useState(() => String(data.config.descuentoPrimeraVezDiasValidez));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    // Mínimo 1 y no 0: configFromRow lee estos dos campos con `||`, así que un
    // 0 guardado se vuelve a leer como el default de fábrica ($1.000 / 7 días)
    // — el admin creería haber apagado la promoción y en realidad la dejó
    // corriendo con otro monto.
    const descuentoPrimeraVezValor = Math.max(1, Number(valorTexto) || 0);
    const descuentoPrimeraVezDiasValidez = Math.max(1, Number(diasTexto) || 0);
    setGuardando(true);
    const ok = await commit({ config: { ...data.config, descuentoPrimeraVezValor, descuentoPrimeraVezDiasValidez } });
    setGuardando(false);
    if (ok) {
      setValorTexto(String(descuentoPrimeraVezValor));
      setDiasTexto(String(descuentoPrimeraVezDiasValidez));
    }
    setMsg({ texto: ok ? "Cambio guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Descuento de primera vez"
      icon={Gift}
      description="Cupón de descuento que se le emite a una patente que todavía no tiene ficha, para su primer lavado. Lo usan los dos canales de registro: el pop-up de la landing y la Opción 5 del bot de WhatsApp. Cada patente recibe uno solo — si ya tiene un descuento pendiente y vigente, se le devuelve ese mismo en vez de emitir otro."
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Monto del descuento (CLP)</label>
        <input type="number" min={1} step={500} value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} style={{ width: 140 }} />
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
          Hoy: {fmtCLP(data.config.descuentoPrimeraVezValor)} de descuento sobre el precio del lavado.
        </div>
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Días de validez desde que se emite</label>
        <input type="number" min={1} value={diasTexto} onChange={(e) => setDiasTexto(e.target.value)} style={{ width: 100 }} />
      </div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
        El cambio rige para los cupones que se emitan de aquí en adelante: los ya entregados conservan el monto y la
        fecha con que salieron.
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
