"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { PLANES } from "@/lib/helpers";
import { ArrowUpCircle } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function UpgradeSection() {
  const { data, commit } = useApp();
  const [horasVentanaVal, setHorasVentanaVal] = useState(() => String(data.config.horasVentanaUpgradePlan));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    const horasVentanaUpgradePlan = Math.max(1, Number(horasVentanaVal) || 0);
    setGuardando(true);
    const ok = await commit({ config: { ...data.config, horasVentanaUpgradePlan } });
    setGuardando(false);
    setMsg({ texto: ok ? "Cambio guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Promoción: upgrade a plan"
      icon={ArrowUpCircle}
      description={`Dentro del tiempo configurado abajo tras pagar un lavado único, al cliente se le ofrece convertir esa visita en la contratación del ${PLANES[0]} pagando solo el adicional: el precio del plan menos lo que efectivamente pagó por ese lavado (ya descontado su cupón, si tenía uno). No se configura aparte — sale del precio del plan.`}
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Horas disponibles para el upgrade (usa múltiplos de 24 para días, ej: 48 = 2 días)</label>
        <input
          type="number"
          min={1}
          value={horasVentanaVal}
          onChange={(e) => setHorasVentanaVal(e.target.value)}
          style={{ width: 100 }}
        />
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
