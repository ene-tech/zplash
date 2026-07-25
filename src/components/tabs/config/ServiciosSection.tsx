"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { precioServicio } from "@/lib/helpers";
import { ListPlus } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function ServiciosSection() {
  const { data, commit } = useApp();
  const catalogoServicios = data.servicios.filter((s) => s.activo);
  const categoriasServicios = Array.from(new Set(catalogoServicios.map((s) => s.categoria || "")));
  const [servicioVals, setServicioVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(catalogoServicios.map((s) => [s.id, String(precioServicio(data.precios, s.id))]))
  );
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    const precios = { ...data.precios };
    catalogoServicios.forEach((s) => {
      precios[s.id] = { normal: Number(servicioVals[s.id]) || 0, promo: 0 };
    });
    setGuardando(true);
    const ok = await commit({ precios });
    setGuardando(false);
    setMsg({ texto: ok ? "Precios actualizados correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection title="Servicios adicionales" icon={ListPlus}>
      {categoriasServicios.map((cat) => (
        <div key={cat}>
          <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
            {cat}
          </div>
          {catalogoServicios
            .filter((s) => s.categoria === cat)
            .map((s) => (
              <div className="field" key={s.id}>
                <label>{s.nombre}</label>
                <PriceInput
                  value={servicioVals[s.id] ?? ""}
                  onChange={(v) => setServicioVals((cur) => ({ ...cur, [s.id]: v }))}
                />
              </div>
            ))}
        </div>
      ))}
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
