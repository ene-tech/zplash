"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { PLANES, UPGRADE_PLAN_KEY, precioUpgradePlan } from "@/lib/helpers";
import { ArrowUpCircle } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function UpgradeSection() {
  const { data, commit } = useApp();
  const [upgradePlanVal, setUpgradePlanVal] = useState(() => String(precioUpgradePlan(data.precios)));
  const [horasVentanaVal, setHorasVentanaVal] = useState(() => String(data.config.horasVentanaUpgradePlan));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    const horasVentanaUpgradePlan = Math.max(1, Number(horasVentanaVal) || 0);
    setGuardando(true);
    const ok = await commit({
      precios: { ...data.precios, [UPGRADE_PLAN_KEY]: { normal: Number(upgradePlanVal) || 0, promo: 0 } },
      config: { ...data.config, horasVentanaUpgradePlan },
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Precio actualizado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Promoción: upgrade a plan"
      icon={ArrowUpCircle}
      description={`Monto adicional que se le ofrece al cliente en el módulo Operador, dentro del tiempo configurado abajo tras pagar un lavado único, para convertir esa visita en la contratación del ${PLANES[0]}.`}
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Precio adicional del upgrade</label>
        <PriceInput value={upgradePlanVal} onChange={setUpgradePlanVal} />
      </div>
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
