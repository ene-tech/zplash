"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { PLANES, uid } from "@/lib/helpers";
import type { TramoReactivacionVencido } from "@/types";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import CanalTramoSelect from "./CanalTramoSelect";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function ReactivacionSection() {
  const { data, commit } = useApp();
  const [tramosReactivacionVals, setTramosReactivacionVals] = useState<Record<string, TramoReactivacionVencido[]>>(
    () => data.config.tramosReactivacionVencido
  );
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const agregarTramo = (plan: string) => {
    setTramosReactivacionVals((cur) => ({
      ...cur,
      [plan]: [
        ...(cur[plan] || []),
        { id: uid(), diasVencidoMin: 0, diasVencidoMax: null, visitasMin: 0, visitasMax: null, precio: 0, canal: "AMBOS" },
      ],
    }));
  };

  const quitarTramo = (plan: string, id: string) => {
    setTramosReactivacionVals((cur) => ({ ...cur, [plan]: (cur[plan] || []).filter((t) => t.id !== id) }));
  };

  const editarTramo = (plan: string, id: string, cambios: Partial<TramoReactivacionVencido>) => {
    setTramosReactivacionVals((cur) => ({
      ...cur,
      [plan]: (cur[plan] || []).map((t) => (t.id === id ? { ...t, ...cambios } : t)),
    }));
  };

  const guardar = async () => {
    setGuardando(true);
    const ok = await commit({ config: { ...data.config, tramosReactivacionVencido: tramosReactivacionVals } });
    setGuardando(false);
    setMsg({ texto: ok ? "Tramos actualizados correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Reactivación de plan vencido"
      icon={RefreshCw}
      description="Ofrece un precio preferencial para recuperar clientes que se vencieron hace poco (Local o Web), según hace cuántos días venció su plan y cuántas veces pasó durante su último período pagado (ej: $15.990 para quien pasó 0 o 1 vez y venció hace 0 a 15 días). Si un cliente no cae en ningún tramo, no se le ofrece esta promoción — un cliente Web sigue viendo su oferta de renovar al mismo valor de su último pedido. El canal define por dónde se puede tomar el precio: “Solo Web” queda disponible únicamente en la cuenta del cliente (y en los correos de plan vencido, que enlazan ahí) y el operador no puede cobrarlo en el local, pero igual ve el aviso para mencionárselo; “Solo Local” solo lo puede cobrar el operador."
    >
      {PLANES.map((p) => (
        <div key={p}>
          <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
            {p}
          </div>
          {(tramosReactivacionVals[p] || []).map((t) => (
            <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="number"
                  min={0}
                  value={t.diasVencidoMin}
                  onChange={(e) => editarTramo(p, t.id, { diasVencidoMin: Number(e.target.value) || 0 })}
                  style={{ width: 60 }}
                />
                <span style={{ color: "var(--gray)", fontSize: 13 }}>a</span>
                <input
                  type="number"
                  min={0}
                  placeholder="∞"
                  value={t.diasVencidoMax ?? ""}
                  onChange={(e) =>
                    editarTramo(p, t.id, { diasVencidoMax: e.target.value === "" ? null : Number(e.target.value) || 0 })
                  }
                  style={{ width: 60 }}
                />
                <span style={{ color: "var(--gray)", fontSize: 13 }}>días vencido</span>
              </div>
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
      ))}

      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
