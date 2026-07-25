"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { PLAN_ONECLICK_KEY, precioPlanOneclick } from "@/lib/helpers";
import { Globe } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function PagosWebSection() {
  const { data, commit } = useApp();
  const [planOneclickVal, setPlanOneclickVal] = useState(() => String(precioPlanOneclick(data.precios)));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    setGuardando(true);
    const ok = await commit({
      precios: { ...data.precios, [PLAN_ONECLICK_KEY]: { normal: Number(planOneclickVal) || 0, promo: 0 } },
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Precio actualizado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Pagos web (/pagar)"
      icon={Globe}
      description="Precio del Plan Ilimitado Mensual cuando el cliente contrata con renovación automática (Oneclick) desde la web — canal aparte de la renovación preferencial, pensado para incentivar la renovación automática."
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Precio con renovación automática</label>
        <PriceInput value={planOneclickVal} onChange={setPlanOneclickVal} />
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
