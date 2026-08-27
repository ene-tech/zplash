"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Lock } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function BloqueoSection() {
  const { data, commit } = useAppData();
  const [horasVal, setHorasVal] = useState(() => String(data.config.horasBloqueoReingresoPlan));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    const horasBloqueoReingresoPlan = Math.max(0.5, Number(horasVal) || 0);
    setGuardando(true);
    const ok = await commit({ config: { ...data.config, horasBloqueoReingresoPlan } });
    setGuardando(false);
    setMsg({ texto: ok ? "Horas actualizadas correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Bloqueo de reingreso — clientes con plan"
      icon={Lock}
      description="Horas mínimas que debe esperar un vehículo con plan antes de volver a pasar por el túnel. Dentro de la primera hora desde el ingreso anterior el reingreso cuenta como garantía (sin cobrar de nuevo); pasada esa hora y hasta cumplir el total configurado, queda bloqueado (salvo pagando un lavado único, o para Administración/Gerencia)."
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Horas de bloqueo hasta el siguiente uso</label>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={horasVal}
          onChange={(e) => setHorasVal(e.target.value)}
          style={{ width: 100 }}
        />
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
