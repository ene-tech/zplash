"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useAppData } from "@/context/AppContext";
import {
  PLANES,
  PLAN_ILIMITADO_LEGACY,
  fmtCLP,
  keyPrimeraContratacion,
  precioNormal,
  precioPreferencial,
  uid,
} from "@/lib/helpers";
import type { TramoRenovacionLocal } from "@/types";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import CanalTramoSelect from "./CanalTramoSelect";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function PlanesSection() {
  const { data, commit } = useAppData();
  const [normalVals, setNormalVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLANES.map((p) => [p, String(precioNormal(data.precios, p))]))
  );
  const [promoVals, setPromoVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLANES.map((p) => [p, String(precioPreferencial(data.precios, p))]))
  );
  // Valor crudo, no precioContratacion(): $0 acá significa "no configurado, se
  // cobra el precio normal", y así el admin puede volver atrás dejándolo en 0.
  const [primeraVals, setPrimeraVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLANES.map((p) => [p, String(data.precios[keyPrimeraContratacion(p)]?.normal || 0)]))
  );
  const [tramosVals, setTramosVals] = useState<Record<string, TramoRenovacionLocal[]>>(
    () => data.config.tramosRenovacionLocal
  );
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const agregarTramo = (plan: string) => {
    setTramosVals((cur) => ({
      ...cur,
      [plan]: [...(cur[plan] || []), { id: uid(), visitasMin: 0, visitasMax: null, precio: 0, canal: "AMBOS" }],
    }));
  };

  const quitarTramo = (plan: string, id: string) => {
    setTramosVals((cur) => ({ ...cur, [plan]: (cur[plan] || []).filter((t) => t.id !== id) }));
  };

  const editarTramo = (plan: string, id: string, cambios: Partial<TramoRenovacionLocal>) => {
    setTramosVals((cur) => ({
      ...cur,
      [plan]: (cur[plan] || []).map((t) => (t.id === id ? { ...t, ...cambios } : t)),
    }));
  };

  const guardar = async () => {
    const precios = { ...data.precios };
    PLANES.forEach((p) => {
      precios[p] = { normal: Number(normalVals[p]) || 0, promo: Number(promoVals[p]) || 0 };
      precios[keyPrimeraContratacion(p)] = { normal: Number(primeraVals[p]) || 0, promo: 0 };
    });
    setGuardando(true);
    const ok = await commit({ precios, config: { ...data.config, tramosRenovacionLocal: tramosVals } });
    setGuardando(false);
    setMsg({ texto: ok ? "Precios actualizados correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Precios de planes y renovación preferencial"
      icon={Tag}
      description="Estos valores se usan para ofrecer la renovación cuando un plan está por vencer, tanto al operador en el local como al cliente en su cuenta web."
    >
      {PLANES.map((p) => (
        <div key={p} className="flex flex-col gap-3">
          <div className="field" style={{ margin: 0 }}>
            <label>Precio normal — {p}</label>
            <PriceInput value={normalVals[p] ?? ""} onChange={(v) => setNormalVals((cur) => ({ ...cur, [p]: v }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Precio promoción de renovación — {p}</label>
            <PriceInput value={promoVals[p] ?? ""} onChange={(v) => setPromoVals((cur) => ({ ...cur, [p]: v }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Precio 1ra contratación — {p}</label>
            <PriceInput value={primeraVals[p] ?? ""} onChange={(v) => setPrimeraVals((cur) => ({ ...cur, [p]: v }))} />
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginTop: 6 }}>
              Precio de entrada solo para quien contrata el plan por primera vez (nunca tuvo uno), en el local y en la
              web. Es solo esa primera vez: después renueva al precio normal. Quien deja vencer su plan y vuelve no
              cuenta como nuevo —para ese está la reactivación. Déjalo en $0 para cobrarle a todos el precio normal.
            </div>
          </div>

          <div>
            <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
              Renovación preferencial anticipada por pasadas — {p}
            </div>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 10 }}>
              Ofrece un precio distinto al de arriba para renovar antes de que el plan venza, según cuántas veces pasó
              el cliente durante su período de plan vigente (ej: $16.990 para quien pasó 0 o 1 vez). El tope de pasadas
              es lo que deja fuera al que viene mucho: si hay tramos para el canal y ninguno le calza, no se le ofrece
              promoción y renueva al precio normal. El canal define por dónde se puede tomar el precio: “Solo Web” queda
              disponible únicamente en la cuenta del cliente —así se le invita a renovar online antes del vencimiento— y
              el operador no lo puede cobrar en el local, pero igual ve el aviso para mencionárselo; “Solo Local” solo lo
              puede cobrar el operador. El precio de promoción de renovación de arriba se sigue usando como respaldo solo
              en los canales que no tengan ningún tramo configurado.
            </div>
            {(tramosVals[p] || []).map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    value={t.visitasMin}
                    onChange={(e) => editarTramo(p, t.id, { visitasMin: Number(e.target.value) || 0 })}
                    style={{ width: 60 }}
                  />
                  <span style={{ color: "var(--gray)", fontSize: 13 }}>a</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="∞"
                    value={t.visitasMax ?? ""}
                    onChange={(e) =>
                      editarTramo(p, t.id, { visitasMax: e.target.value === "" ? null : Number(e.target.value) || 0 })
                    }
                    style={{ width: 60 }}
                  />
                  <span style={{ color: "var(--gray)", fontSize: 13 }}>pasadas</span>
                </div>
                <CanalTramoSelect value={t.canal} onChange={(canal) => editarTramo(p, t.id, { canal })} />
                <PriceInput
                  value={String(t.precio)}
                  onChange={(v) => editarTramo(p, t.id, { precio: Number(v) || 0 })}
                  style={{ flex: 1 }}
                />
                <button className="icon-btn" onClick={() => quitarTramo(p, t.id)}>
                  Quitar
                </button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => agregarTramo(p)}>
              + Agregar tramo
            </Button>
          </div>
        </div>
      ))}

      {/* Los precios del ilimitado viejo siguen guardados en `precios` pero ya
          no los cobra nadie (planVendible cotiza todo al plan de arriba). Se
          muestran para que ningún valor que exista en la base quede invisible
          acá y se lea como vigente — de solo lectura a propósito: un input
          sería una perilla que no mueve ningún precio ofrecido.
          ponytail: solo esta fila muerta; si aparecen más, listarlas desde las
          claves de `precios` que ninguna sección de Configuración edita. */}
      <div className="field" style={{ margin: 0 }}>
        <label>{PLAN_ILIMITADO_LEGACY} (histórico) — ya no se cobra</label>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13 }}>
          Quedan guardados {fmtCLP(precioNormal(data.precios, PLAN_ILIMITADO_LEGACY))} de precio normal y{" "}
          {fmtCLP(precioPreferencial(data.precios, PLAN_ILIMITADO_LEGACY))} de preferencial de cuando se vendía este
          plan, pero no se le cobran a nadie: los clientes que todavía lo tienen renuevan, reactivan y contratan con los
          precios de {PLANES[0]} de arriba (su plan sin tope se les respeta hasta que termine el mes que ya pagaron, el
          precio no). Por eso no se editan acá: el valor que rige es el de arriba.
        </div>
      </div>

      <SaveBar saving={guardando} msg={msg} onSave={guardar} label="Guardar precios" />
    </ConfigSection>
  );
}
