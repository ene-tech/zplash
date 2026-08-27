"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { PLANES } from "@/lib/helpers";
import { CalendarClock } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function PagoAtrasadoSection() {
  const { data, commit } = useAppData();
  const [diasVal, setDiasVal] = useState(() => String(data.config.diasGraciaPagoAtrasado));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    // 0 = sin plazo de gracia (apenas vence, paga el precio vigente y el ciclo
    // arranca de nuevo): es una configuración válida, no un valor sin cargar.
    const diasGraciaPagoAtrasado = Math.max(0, Math.round(Number(diasVal) || 0));
    setGuardando(true);
    const ok = await commit({ config: { ...data.config, diasGraciaPagoAtrasado } });
    setGuardando(false);
    setMsg({ texto: ok ? "Cambio guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Pago de plan atrasado"
      icon={CalendarClock}
      description={`Días que un cliente tiene para pagar su ${PLANES[0]} después de vencido y que igual cuente como una renovación normal: se le respeta el precio al que venía contratado (aunque el precio de lista haya subido) y mantiene su fecha de vencimiento, o sea que el próximo vence un mes después del anterior y no un mes después del día que pagó. Aplica tanto en el mesón como en la web (Mi Cuenta y pagar). Pasado el plazo el cliente paga el precio vigente, el ciclo arranca de cero, y sigue disponible la promoción de reactivación que le corresponda.`}
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Días de plazo para pagar atrasado (0 = sin plazo)</label>
        <input type="number" min={0} value={diasVal} onChange={(e) => setDiasVal(e.target.value)} style={{ width: 100 }} />
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
