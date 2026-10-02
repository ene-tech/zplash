"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { fmtCLP } from "@/lib/helpers";
import { Users } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

// Gemela de PrimeraVezSection para el programa de referidos (ver @/lib/referidos).
export default function ReferidosSection() {
  const { data, commit } = useAppData();
  const [valorTexto, setValorTexto] = useState(() => String(data.config.descuentoReferidoValor));
  const [diasTexto, setDiasTexto] = useState(() => String(data.config.descuentoReferidoDiasValidez));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    // Mínimo 1: configFromRow lee con `||`, un 0 volvería como el default.
    const descuentoReferidoValor = Math.max(1, Number(valorTexto) || 0);
    const descuentoReferidoDiasValidez = Math.max(1, Number(diasTexto) || 0);
    setGuardando(true);
    const ok = await commit({ config: { ...data.config, descuentoReferidoValor, descuentoReferidoDiasValidez } });
    setGuardando(false);
    if (ok) {
      setValorTexto(String(descuentoReferidoValor));
      setDiasTexto(String(descuentoReferidoDiasValidez));
    }
    setMsg({ texto: ok ? "Cambio guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Programa de referidos"
      icon={Users}
      description="Regala y gana: el cliente comparte su link (Mi Cuenta o el WhatsApp del lavado único), el amigo nuevo recibe este descuento para su primer lavado y, cuando lo usa, quien lo invitó gana un descuento igual. Los premios se guardan en la cuenta pero no se acumulan: se aplica uno por pago."
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Monto del descuento (CLP)</label>
        <input type="number" min={1} step={500} value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} style={{ width: 140 }} />
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
          Hoy: {fmtCLP(data.config.descuentoReferidoValor)} para el amigo y {fmtCLP(data.config.descuentoReferidoValor)} de premio
          para quien invita.
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
