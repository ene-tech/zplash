"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useAppData } from "@/context/AppContext";
import {
  DIAS_PROMO_RECOMPRA_2,
  HORAS_VENTANA_RECOMPRA_PACK,
  PROMOS_LAVADOS,
  PROMO_RECOMPRA_2_KEY,
  PROMO_VIP_KEY,
  TICKETS_VIP_PATENTE,
  TICKETS_UPGRADE_DESCUENTO,
  TICKETS_UPGRADE_PACK,
  UPGRADE_DESCUENTO_KEY,
  UPGRADE_PACK_KEY,
  precioPromoRecompra2,
  precioPromoVip,
  precioUpgradeDescuento,
  precioUpgradePack,
} from "@/lib/helpers";
import { ArrowUpCircle } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

// Upgrade a Promo 4 Lavados (ver UPGRADE_PACK_KEY): el precio es una fila más
// de `precios` y la ventana sigue en config.horasVentanaUpgradePlan, la
// columna que usaba el upgrade a plan que este reemplazó.
export default function UpgradeSection() {
  const { data, commit } = useAppData();
  const [precioVal, setPrecioVal] = useState(() => String(precioUpgradePack(data.precios)));
  const [precioDescuentoVal, setPrecioDescuentoVal] = useState(() => String(precioUpgradeDescuento(data.precios)));
  const [precioVipVal, setPrecioVipVal] = useState(() => String(precioPromoVip(data.precios)));
  const [precioRecompra2Val, setPrecioRecompra2Val] = useState(() => String(precioPromoRecompra2(data.precios)));
  const [horasVentanaVal, setHorasVentanaVal] = useState(() => String(data.config.horasVentanaUpgradePlan));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    const horasVentanaUpgradePlan = Math.max(1, Number(horasVentanaVal) || 0);
    setGuardando(true);
    const ok = await commit({
      config: { ...data.config, horasVentanaUpgradePlan },
      precios: {
        ...data.precios,
        [UPGRADE_PACK_KEY]: { normal: Number(precioVal) || 0, promo: 0 },
        [UPGRADE_DESCUENTO_KEY]: { normal: Number(precioDescuentoVal) || 0, promo: 0 },
        [PROMO_VIP_KEY]: { normal: Number(precioVipVal) || 0, promo: 0 },
        [PROMO_RECOMPRA_2_KEY]: { normal: Number(precioRecompra2Val) || 0, promo: 0 },
      },
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Cambio guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Promoción: upgrade a Promo 4 lavados"
      icon={ArrowUpCircle}
      description={`Dentro del tiempo configurado abajo tras pagar un Lavado Tunel / Uso Aspirado, al cliente sin plan vigente se le ofrece, en el mesón y en Mi Cuenta, sumar ${TICKETS_UPGRADE_PACK} lavados más para la misma patente por este adicional: queda como si hubiera comprado la Promo ${PROMOS_LAVADOS.promo_5_lavados.lavados} lavados, con los tickets vigentes ${PROMOS_LAVADOS.promo_5_lavados.dias} días desde ese lavado.`}
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Precio adicional — $0 la apaga</label>
        <PriceInput value={precioVal} onChange={setPrecioVal} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>
          Si el lavado fue con cupón de descuento (solo mesón): precio por {TICKETS_UPGRADE_DESCUENTO} lavados más — $0 la
          apaga
        </label>
        <PriceInput value={precioDescuentoVal} onChange={setPrecioDescuentoVal} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>
          {PROMO_VIP_KEY} (solo mesón, hasta {HORAS_VENTANA_RECOMPRA_PACK} h después de gastar el último ticket de un pack):{" "}
          {TICKETS_VIP_PATENTE} tickets para la patente + 1 libre — $0 la apaga
        </label>
        <PriceInput value={precioVipVal} onChange={setPrecioVipVal} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>
          {PROMO_RECOMPRA_2_KEY} (solo mesón, misma ventana que la VIP): 2 tickets para la patente que vencen{" "}
          {DIAS_PROMO_RECOMPRA_2} días después de la compra — $0 la apaga
        </label>
        <PriceInput value={precioRecompra2Val} onChange={setPrecioRecompra2Val} />
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
