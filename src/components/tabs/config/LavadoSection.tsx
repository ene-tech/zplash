"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useAppData } from "@/context/AppContext";
import {
  DIAS_PROMO_2_LAVADOS,
  LAVADO_ADICIONAL_KEY,
  LAVADO_UNICO_KEY,
  LAVADOS_PROMO_2_LAVADOS,
  PROMO_2_LAVADOS_KEY,
  precioLavadoAdicional,
  precioLavadoUnico,
  precioPromo2Lavados,
} from "@/lib/helpers";
import { Droplets } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function LavadoSection() {
  const { data, commit } = useAppData();
  const [lavadoUnicoVal, setLavadoUnicoVal] = useState(() => String(precioLavadoUnico(data.precios)));
  const [lavadoAdicionalVal, setLavadoAdicionalVal] = useState(() => String(precioLavadoAdicional(data.precios)));
  const [promo2Val, setPromo2Val] = useState(() => String(precioPromo2Lavados(data.precios)));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    setGuardando(true);
    const ok = await commit({
      precios: {
        ...data.precios,
        [LAVADO_UNICO_KEY]: { normal: Number(lavadoUnicoVal) || 0, promo: 0 },
        [LAVADO_ADICIONAL_KEY]: { normal: Number(lavadoAdicionalVal) || 0, promo: 0 },
        [PROMO_2_LAVADOS_KEY]: { normal: Number(promo2Val) || 0, promo: 0 },
      },
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Precio actualizado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection title="Lavado túnel suelto" icon={Droplets}>
      <div className="field" style={{ margin: 0 }}>
        <label>Precio lavado único (sin plan vigente)</label>
        <PriceInput value={lavadoUnicoVal} onChange={setLavadoUnicoVal} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Precio lavado adicional (plan vigente, pasadas agotadas)</label>
        <PriceInput value={lavadoAdicionalVal} onChange={setLavadoAdicionalVal} />
      </div>
      {/* Promo 2 Lavados (ver PROMO_2_LAVADOS_KEY): mismo precio en el mesón y
          en /pagar. $0 la apaga en los dos canales. */}
      <div className="field" style={{ margin: 0 }}>
        <label>
          Promo {LAVADOS_PROMO_2_LAVADOS} lavados para un auto, {DIAS_PROMO_2_LAVADOS} días (mesón y web) — $0 la apaga
        </label>
        <PriceInput value={promo2Val} onChange={setPromo2Val} />
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
