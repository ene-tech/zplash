"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { LAVADO_UNICO_KEY, precioLavadoUnico } from "@/lib/helpers";
import { Droplets } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function LavadoSection() {
  const { data, commit } = useApp();
  const [lavadoUnicoVal, setLavadoUnicoVal] = useState(() => String(precioLavadoUnico(data.precios)));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    setGuardando(true);
    const ok = await commit({
      precios: { ...data.precios, [LAVADO_UNICO_KEY]: { normal: Number(lavadoUnicoVal) || 0, promo: 0 } },
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Precio actualizado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection title="Lavado túnel (sin plan)" icon={Droplets}>
      <div className="field" style={{ margin: 0 }}>
        <label>Precio lavado único</label>
        <PriceInput value={lavadoUnicoVal} onChange={setLavadoUnicoVal} />
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
