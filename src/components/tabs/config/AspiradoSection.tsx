"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { ZONA_ASPIRADO_KEY, precioZonaAspirado } from "@/lib/helpers";
import { Wind } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function AspiradoSection() {
  const { data, commit } = useApp();
  const [zonaAspiradoVal, setZonaAspiradoVal] = useState(() => String(precioZonaAspirado(data.precios)));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    setGuardando(true);
    const ok = await commit({
      precios: { ...data.precios, [ZONA_ASPIRADO_KEY]: { normal: Number(zonaAspiradoVal) || 0, promo: 0 } },
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Precio actualizado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection title="Uso Zona Aspirado Autoservicio" icon={Wind}>
      <div className="field" style={{ margin: 0 }}>
        <label>Precio uso puntual</label>
        <PriceInput value={zonaAspiradoVal} onChange={setZonaAspiradoVal} />
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
