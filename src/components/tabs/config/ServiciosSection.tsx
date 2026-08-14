"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { precioServicio } from "@/lib/helpers";
import { TAMANOS_VEHICULO, TAMANO_LABEL, type TamanoVehiculo } from "@/types";
import { ListPlus } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

const TAMANO_VACIO: Record<TamanoVehiculo, number> = { s: 0, m: 0, l: 0, xl: 0 };

export default function ServiciosSection() {
  const { data, commit } = useApp();
  const catalogoServicios = data.servicios.filter((s) => s.activo);
  const categoriasServicios = Array.from(new Set(catalogoServicios.map((s) => s.categoria || "")));
  const [servicioVals, setServicioVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(catalogoServicios.map((s) => [s.id, String(precioServicio(data.precios, s.id))]))
  );
  const [tamanoVals, setTamanoVals] = useState<Record<string, Record<TamanoVehiculo, string>>>(() =>
    Object.fromEntries(
      catalogoServicios.map((s) => {
        const guardado = data.preciosTamano[s.id] ?? TAMANO_VACIO;
        return [s.id, { s: String(guardado.s), m: String(guardado.m), l: String(guardado.l), xl: String(guardado.xl) }];
      })
    )
  );
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    const precios = { ...data.precios };
    const preciosTamano = { ...data.preciosTamano };
    catalogoServicios.forEach((s) => {
      precios[s.id] = { normal: Number(servicioVals[s.id]) || 0, promo: 0 };
      preciosTamano[s.id] = {
        s: Number(tamanoVals[s.id]?.s) || 0,
        m: Number(tamanoVals[s.id]?.m) || 0,
        l: Number(tamanoVals[s.id]?.l) || 0,
        xl: Number(tamanoVals[s.id]?.xl) || 0,
      };
    });
    setGuardando(true);
    const ok = await commit({ precios, preciosTamano });
    setGuardando(false);
    setMsg({ texto: ok ? "Precios actualizados correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Servicios adicionales"
      icon={ListPlus}
      description="Precios por tamaño de vehículo (opcional): si se cargan, reemplazan al precio general en la web pública para ese tamaño. Un tamaño en 0 cae de vuelta al precio general."
    >
      {categoriasServicios.map((cat) => (
        <div key={cat}>
          <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
            {cat}
          </div>
          {catalogoServicios
            .filter((s) => s.categoria === cat)
            .map((s) => (
              <div key={s.id} style={{ marginBottom: 14 }}>
                <div className="field">
                  <label>{s.nombre}</label>
                  <PriceInput
                    value={servicioVals[s.id] ?? ""}
                    onChange={(v) => setServicioVals((cur) => ({ ...cur, [s.id]: v }))}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {TAMANOS_VEHICULO.map((t) => (
                    <div className="field" key={t} style={{ width: 100, margin: 0 }}>
                      <label>{TAMANO_LABEL[t]}</label>
                      <PriceInput
                        value={tamanoVals[s.id]?.[t] ?? ""}
                        onChange={(v) => setTamanoVals((cur) => ({ ...cur, [s.id]: { ...cur[s.id], [t]: v } }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ))}
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
