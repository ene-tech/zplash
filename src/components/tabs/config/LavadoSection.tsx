"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { LAVADO_ADICIONAL_KEY, LAVADO_UNICO_KEY, precioLavadoAdicional, precioLavadoUnico } from "@/lib/helpers";
import { Droplets } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function LavadoSection() {
  const { data, commit } = useApp();
  const [lavadoUnicoVal, setLavadoUnicoVal] = useState(() => String(precioLavadoUnico(data.precios)));
  const [lavadoAdicionalVal, setLavadoAdicionalVal] = useState(() => String(precioLavadoAdicional(data.precios)));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    setGuardando(true);
    const ok = await commit({
      precios: {
        ...data.precios,
        [LAVADO_UNICO_KEY]: { normal: Number(lavadoUnicoVal) || 0, promo: 0 },
        [LAVADO_ADICIONAL_KEY]: { normal: Number(lavadoAdicionalVal) || 0, promo: 0 },
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
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
