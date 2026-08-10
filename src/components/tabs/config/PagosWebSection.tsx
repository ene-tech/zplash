"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { LAVADO_UNICO_WEB_KEY, PLAN_ONECLICK_KEY, precioLavadoUnicoWeb, precioPlanOneclick } from "@/lib/helpers";
import { Globe } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function PagosWebSection() {
  const { data, commit } = useApp();
  const [planOneclickVal, setPlanOneclickVal] = useState(() => String(precioPlanOneclick(data.precios)));
  const [lavadoUnicoWebVal, setLavadoUnicoWebVal] = useState(() => String(precioLavadoUnicoWeb(data.precios)));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    setGuardando(true);
    const ok = await commit({
      precios: {
        ...data.precios,
        [PLAN_ONECLICK_KEY]: { normal: Number(planOneclickVal) || 0, promo: 0 },
        [LAVADO_UNICO_WEB_KEY]: { normal: Number(lavadoUnicoWebVal) || 0, promo: 0 },
      },
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Precio actualizado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Pagos web (/pagar)"
      icon={Globe}
      description="Precios del canal web, separados de los que cobra el módulo Operador en el local — permite tener una promoción online distinta a la presencial sin que una afecte a la otra."
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Precio Plan Ilimitado con renovación automática</label>
        <PriceInput value={planOneclickVal} onChange={setPlanOneclickVal} />
      </div>
      <div className="field">
        <label>Precio Lavado único (web)</label>
        <PriceInput value={lavadoUnicoWebVal} onChange={setLavadoUnicoWebVal} />
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
