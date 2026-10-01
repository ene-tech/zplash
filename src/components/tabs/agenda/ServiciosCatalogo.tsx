"use client";

import { useRef, useState } from "react";
import { Clock, Layers } from "lucide-react";
import PriceInput from "@/components/PriceInput";
import ConfigSection from "@/components/tabs/config/ConfigSection";
import SaveBar from "@/components/tabs/config/SaveBar";
import { useAppData } from "@/context/AppContext";
import { uid } from "@/lib/helpers";
import { TAMANOS_VEHICULO, TAMANO_LABEL, type Servicio, type TamanoVehiculo } from "@/types";

// Mismo formato que Configuración > Servicios adicionales (precio general +
// S/M/L/XL), acá con minutos: una talla vacía usa la duración general (ver
// duracionServicioTamano).
type Minutos = Record<"general" | TamanoVehiculo, string>;

function minutosDe(s: Servicio): Minutos {
  const t = s.duracionTamano;
  return {
    general: String(s.duracionMinutos),
    s: t?.s ? String(t.s) : "",
    m: t?.m ? String(t.m) : "",
    l: t?.l ? String(t.l) : "",
    xl: t?.xl ? String(t.xl) : "",
  };
}

export function ServiciosCatalogo() {
  const { data, commit } = useAppData();
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLInputElement>(null);
  const duracionRef = useRef<HTMLInputElement>(null);
  const [precioTexto, setPrecioTexto] = useState("");
  const [editados, setEditados] = useState<Record<string, Minutos>>({});
  const [guardando, setGuardando] = useState(false);
  const [msgDuraciones, setMsgDuraciones] = useState<{ texto: string; ok: boolean } | null>(null);

  const categorias = Array.from(new Set(data.servicios.map((s) => s.categoria || "Sin categoría")));
  const valor = (s: Servicio) => editados[s.id] ?? minutosDe(s);
  const editar = (s: Servicio, campo: keyof Minutos, v: string) =>
    setEditados((cur) => ({ ...cur, [s.id]: { ...valor(s), [campo]: v } }));

  const guardarDuraciones = async () => {
    if (data.servicios.some((s) => !(Number(valor(s).general) > 0))) {
      setMsgDuraciones({ texto: "La duración general de cada servicio debe ser mayor a 0", ok: false });
      return;
    }
    const servicios = data.servicios.map((s) => {
      const v = valor(s);
      return {
        ...s,
        duracionMinutos: Number(v.general),
        duracionTamano: { s: Number(v.s) || 0, m: Number(v.m) || 0, l: Number(v.l) || 0, xl: Number(v.xl) || 0 },
      };
    });
    setGuardando(true);
    const ok = await commit({ servicios });
    setGuardando(false);
    if (ok) setEditados({});
    setMsgDuraciones({ texto: ok ? "Duraciones actualizadas correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  const [descuentoPct, setDescuentoPct] = useState(String(data.config.agendaDescuentoCombinadoPct));
  const [topeMinutos, setTopeMinutos] = useState(String(data.config.agendaTopeMinutos));
  const [guardandoCombinados, setGuardandoCombinados] = useState(false);
  const [msgCombinados, setMsgCombinados] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardarCombinados = async () => {
    const pct = Number(descuentoPct);
    const tope = Number(topeMinutos);
    if (!(pct >= 0 && pct <= 90) || !(tope >= 0)) {
      setMsgCombinados({ texto: "El descuento va de 0 a 90% y el tope no puede ser negativo", ok: false });
      return;
    }
    setGuardandoCombinados(true);
    const ok = await commit({ config: { ...data.config, agendaDescuentoCombinadoPct: pct, agendaTopeMinutos: tope } });
    setGuardandoCombinados(false);
    setMsgCombinados({ texto: ok ? "Configuración actualizada correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

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

  return (
    <div style={{ maxWidth: 620, marginBottom: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      <ConfigSection
        title="Servicios"
        icon={Clock}
        description="Duración en minutos: define el largo del cupo al agendar. Por tamaño de vehículo (opcional): si se cargan, reemplazan a la duración general para ese tamaño. Un tamaño vacío o en 0 cae de vuelta a la duración general. El precio se ajusta en Configuración."
      >
        {categorias.map((cat) => (
          <div key={cat}>
            <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
              {cat}
            </div>
            {data.servicios
              .filter((s) => (s.categoria || "Sin categoría") === cat)
              .map((s) => (
                <div key={s.id} style={{ marginBottom: 14, opacity: s.activo ? 1 : 0.5 }}>
                  <div className="field">
                    <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1 }}>{s.nombre} (minutos)</span>
                      <button className="icon-btn" onClick={() => toggleActivo(s)}>
                        {s.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </label>
                    <input type="number" min={5} value={valor(s).general} onChange={(e) => editar(s, "general", e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {TAMANOS_VEHICULO.map((t) => (
                      <div className="field" key={t} style={{ width: 100, margin: 0 }}>
                        <label>{TAMANO_LABEL[t]}</label>
                        <input
                          type="number"
                          min={0}
                          value={valor(s)[t]}
                          placeholder={valor(s).general}
                          onChange={(e) => editar(s, t, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ))}
        <SaveBar saving={guardando} msg={msgDuraciones} onSave={guardarDuraciones} />
      </ConfigSection>

      <ConfigSection
        title="Servicios combinados"
        icon={Layers}
        description="Cuando una cita lleva 2 o más servicios, la suma de sus duraciones se rebaja este porcentaje (ej. 240 + 150 = 390 min con 20% → 312 min). El tope es el máximo que puede durar una cita, sin importar cuántos servicios lleve (0 = sin tope)."
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ width: 240, margin: 0 }}>
            <label>Descuento por combinar (%)</label>
            <input type="number" min={0} max={90} value={descuentoPct} onChange={(e) => setDescuentoPct(e.target.value)} />
          </div>
          <div className="field" style={{ width: 240, margin: 0 }}>
            <label>Tope máximo (minutos)</label>
            <input type="number" min={0} value={topeMinutos} onChange={(e) => setTopeMinutos(e.target.value)} />
          </div>
        </div>
        <SaveBar saving={guardandoCombinados} msg={msgCombinados} onSave={guardarCombinados} />
      </ConfigSection>

      <div className="modal" style={{ maxWidth: 620, margin: 0 }}>
        <h3>Nuevo servicio</h3>
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
    </div>
  );
}
