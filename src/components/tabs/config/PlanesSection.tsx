"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { PLANES, precioNormal, precioPreferencial, uid } from "@/lib/helpers";
import type { TramoRenovacionLocal } from "@/types";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function PlanesSection() {
  const { data, commit } = useApp();
  const [normalVals, setNormalVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLANES.map((p) => [p, String(precioNormal(data.precios, p))]))
  );
  const [promoVals, setPromoVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLANES.map((p) => [p, String(precioPreferencial(data.precios, p))]))
  );
  const [tramosVals, setTramosVals] = useState<Record<string, TramoRenovacionLocal[]>>(
    () => data.config.tramosRenovacionLocal
  );
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const agregarTramo = (plan: string) => {
    setTramosVals((cur) => ({
      ...cur,
      [plan]: [...(cur[plan] || []), { id: uid(), visitasMin: 0, visitasMax: null, precio: 0 }],
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
      description="Estos valores se usan para mostrar la oferta de renovación al operador cuando un plan está por vencer."
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

          <div>
            <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
              Renovación preferencial por visitas — {p} (clientes Local)
            </div>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 10 }}>
              Ofrece un precio distinto al de arriba según cuántas veces ha pasado el cliente por el local (ej:
              $16.990 para quienes pasaron 0 o 1 vez). Si un cliente no cae en ningún tramo, se usa el precio de
              promoción de renovación de arriba. No aplica a clientes Web.
            </div>
            {(tramosVals[p] || []).map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
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
                  <span style={{ color: "var(--gray)", fontSize: 13 }}>visitas</span>
                </div>
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

      <SaveBar saving={guardando} msg={msg} onSave={guardar} label="Guardar precios" />
    </ConfigSection>
  );
}
