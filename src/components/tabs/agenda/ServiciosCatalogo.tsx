"use client";

import { useRef, useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { fmtCLP, precioServicio, uid } from "@/lib/helpers";
import type { Servicio } from "@/types";

export function ServiciosCatalogo() {
  const { data, commit } = useApp();
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLInputElement>(null);
  const duracionRef = useRef<HTMLInputElement>(null);
  const [precioTexto, setPrecioTexto] = useState("");

  const categorias = Array.from(new Set(data.servicios.map((s) => s.categoria || "Sin categoría")));

  const agregar = async () => {
    const nombre = nombreRef.current?.value.trim() || "";
    const duracion = Number(duracionRef.current?.value) || 0;
    if (!nombre) {
      setErr({ msg: "El nombre es obligatorio", ok: false });
      return;
    }
    if (duracion <= 0) {
      setErr({ msg: "La duración debe ser mayor a 0", ok: false });
      return;
    }
    const nuevo: Servicio = {
      id: uid(),
      nombre,
      categoria: categoriaRef.current?.value.trim() || undefined,
      duracionMinutos: duracion,
      activo: true,
    };
    const precioInicial = Number(precioTexto) || 0;
    const ok = await commit({
      servicios: [...data.servicios, nuevo],
      precios: { ...data.precios, [nuevo.id]: { normal: precioInicial, promo: 0 } },
    });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Servicio agregado correctamente", ok: true });
    if (nombreRef.current) nombreRef.current.value = "";
    if (categoriaRef.current) categoriaRef.current.value = "";
    if (duracionRef.current) duracionRef.current.value = "";
    setPrecioTexto("");
  };

  const toggleActivo = (s: Servicio) => {
    commit({ servicios: data.servicios.map((x) => (x.id === s.id ? { ...x, activo: !x.activo } : x)) });
  };

  const cambiarDuracion = (s: Servicio, duracion: number) => {
    if (duracion <= 0) return;
    commit({ servicios: data.servicios.map((x) => (x.id === s.id ? { ...x, duracionMinutos: duracion } : x)) });
  };

  return (
    <div className="modal" style={{ maxWidth: 620, margin: "0 0 20px 0" }}>
      <h3>Servicios</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Catálogo compartido entre Servicios Adicionales (venta rápida) y la Agenda. La duración determina el largo del
        cupo al agendar (equivalente a un &quot;procedimiento&quot;); el precio se puede reajustar después desde Configuración.
      </div>

      {categorias.map((cat) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div className="hint" style={{ textAlign: "left", marginBottom: 6, textTransform: "uppercase", fontWeight: 700 }}>
            {cat}
          </div>
          {data.servicios
            .filter((s) => (s.categoria || "Sin categoría") === cat)
            .map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border)",
                  opacity: s.activo ? 1 : 0.5,
                }}
              >
                <div style={{ flex: 1 }}>{s.nombre}</div>
                <span style={{ fontSize: 13, color: "var(--gray)" }}>{fmtCLP(precioServicio(data.precios, s.id))}</span>
                <input
                  type="number"
                  min={5}
                  defaultValue={s.duracionMinutos}
                  onBlur={(e) => cambiarDuracion(s, Number(e.target.value))}
                  style={{ width: 70 }}
                  title="Duración en minutos"
                />
                <span style={{ fontSize: 12, color: "var(--gray)" }}>min</span>
                <button className="icon-btn" onClick={() => toggleActivo(s)}>
                  {s.activo ? "Desactivar" : "Reactivar"}
                </button>
              </div>
            ))}
        </div>
      ))}

      <h3 style={{ marginTop: 18 }}>Nuevo servicio</h3>
      <div className="field">
        <label>Nombre</label>
        <input ref={nombreRef} placeholder="Ej: Encerado" />
      </div>
      <div className="field">
        <label>Categoría</label>
        <input ref={categoriaRef} placeholder="Ej: Servicios Adicionales" />
      </div>
      <div className="field">
        <label>Duración (minutos)</label>
        <input ref={duracionRef} type="number" min={5} defaultValue={30} />
      </div>
      <div className="field">
        <label>Precio inicial</label>
        <PriceInput value={precioTexto} onChange={setPrecioTexto} />
      </div>
      <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
        {err?.msg || ""}
      </div>
      <button className="btn" onClick={agregar}>
        Agregar servicio
      </button>
    </div>
  );
}
