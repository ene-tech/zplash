"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useAppData } from "@/context/AppContext";
import { PROMOS_LAVADOS, TICKETS_UPGRADE_PACK, UPGRADE_PACK_KEY, precioUpgradePack } from "@/lib/helpers";
import { ArrowUpCircle } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

// Upgrade a Promo 4 Lavados (ver UPGRADE_PACK_KEY): el precio es una fila más
// de `precios` y la ventana sigue en config.horasVentanaUpgradePlan, la
// columna que usaba el upgrade a plan que este reemplazó.
export default function UpgradeSection() {
  const { data, commit } = useAppData();
  const [precioVal, setPrecioVal] = useState(() => String(precioUpgradePack(data.precios)));
  const [horasVentanaVal, setHorasVentanaVal] = useState(() => String(data.config.horasVentanaUpgradePlan));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    const horasVentanaUpgradePlan = Math.max(1, Number(horasVentanaVal) || 0);
    setGuardando(true);
    const ok = await commit({
      config: { ...data.config, horasVentanaUpgradePlan },
      precios: { ...data.precios, [UPGRADE_PACK_KEY]: { normal: Number(precioVal) || 0, promo: 0 } },
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Cambio guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Promoción: upgrade a Promo 4 lavados"
      icon={ArrowUpCircle}
      description={`Dentro del tiempo configurado abajo tras pagar un lavado único, al cliente sin plan vigente se le ofrece, en el mesón y en Mi Cuenta, sumar ${TICKETS_UPGRADE_PACK} lavados más para la misma patente por este adicional: queda como si hubiera comprado la Promo ${PROMOS_LAVADOS.promo_5_lavados.lavados} lavados, con los tickets vigentes ${PROMOS_LAVADOS.promo_5_lavados.dias} días desde ese lavado.`}
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Precio adicional — $0 la apaga</label>
        <PriceInput value={precioVal} onChange={setPrecioVal} />
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
