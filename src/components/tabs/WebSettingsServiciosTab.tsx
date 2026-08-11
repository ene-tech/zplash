"use client";

import { useRef, useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { precioServicio, uid } from "@/lib/helpers";
import { subirBannerServicio } from "@/lib/serverActions";
import { TAMANOS_VEHICULO, TAMANO_LABEL, type Servicio, type TamanoVehiculo } from "@/types";

const DURACION_DEFAULT = 30;
const TAMANO_VACIO: Record<TamanoVehiculo, number> = { s: 0, m: 0, l: 0, xl: 0 };

function ServicioRow({ servicio }: { servicio: Servicio }) {
  const { data, commit } = useApp();
  const [nombre, setNombre] = useState(servicio.nombre);
  const [categoria, setCategoria] = useState(servicio.categoria || "");
  const [precioTexto, setPrecioTexto] = useState(String(precioServicio(data.precios, servicio.id)));
  const tamanoGuardado = data.preciosTamano[servicio.id] ?? TAMANO_VACIO;
  const [tamanoTexto, setTamanoTexto] = useState<Record<TamanoVehiculo, string>>({
    s: String(tamanoGuardado.s),
    m: String(tamanoGuardado.m),
    l: String(tamanoGuardado.l),
    xl: String(tamanoGuardado.xl),
  });
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hayCambios = nombre.trim() !== servicio.nombre || categoria.trim() !== (servicio.categoria || "") ||
    (Number(precioTexto) || 0) !== precioServicio(data.precios, servicio.id) ||
    TAMANOS_VEHICULO.some((t) => (Number(tamanoTexto[t]) || 0) !== tamanoGuardado[t]);

  const guardar = async () => {
    if (!nombre.trim()) {
      setMsg({ texto: "El nombre es obligatorio", ok: false });
      return;
    }
    setGuardando(true);
    const ok = await commit({
      servicios: data.servicios.map((s) =>
        s.id === servicio.id ? { ...s, nombre: nombre.trim(), categoria: categoria.trim() || undefined } : s
      ),
      precios: { ...data.precios, [servicio.id]: { ...data.precios[servicio.id], normal: Number(precioTexto) || 0 } },
      preciosTamano: {
        ...data.preciosTamano,
        [servicio.id]: {
          s: Number(tamanoTexto.s) || 0,
          m: Number(tamanoTexto.m) || 0,
          l: Number(tamanoTexto.l) || 0,
          xl: Number(tamanoTexto.xl) || 0,
        },
      },
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Guardado" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  const toggleActivo = () => {
    commit({ servicios: data.servicios.map((s) => (s.id === servicio.id ? { ...s, activo: !s.activo } : s)) });
  };

  const subirImagen = async (file: File) => {
    setSubiendo(true);
    const url = await subirBannerServicio(servicio.id, file);
    setSubiendo(false);
    if (!url) {
      setMsg({ texto: "No se pudo subir la imagen. Intenta de nuevo.", ok: false });
      return;
    }
    const ok = await commit({ servicios: data.servicios.map((s) => (s.id === servicio.id ? { ...s, imagen: url } : s)) });
    setMsg({ texto: ok ? "Banner actualizado" : "Se subió la imagen pero no se pudo guardar. Intenta de nuevo.", ok });
  };

  return (
    <div className="vehicle-card" style={{ opacity: servicio.activo ? 1 : 0.6, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              width: 90,
              height: 90,
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: "var(--gray)",
              textAlign: "center",
            }}
          >
            {servicio.imagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={servicio.imagen} alt={servicio.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              "Sin banner"
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ marginTop: 8, fontSize: 11, width: 90 }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) subirImagen(file);
            }}
            disabled={subiendo}
          />
          {subiendo && <div style={{ fontSize: 11, color: "var(--gray)" }}>Subiendo...</div>}
        </div>

        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 160, margin: "0 0 8px" }}>
              <label>Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160, margin: "0 0 8px" }}>
              <label>Categoría</label>
              <input value={categoria} onChange={(e) => setCategoria(e.target.value)} />
            </div>
            <div className="field" style={{ width: 140, margin: "0 0 8px" }}>
              <label>Precio</label>
              <PriceInput value={precioTexto} onChange={setPrecioTexto} />
            </div>
          </div>
          <div className="hint" style={{ textAlign: "left", margin: "4px 0 6px" }}>
            Precios por tamaño de vehículo (opcional): si se cargan, reemplazan al precio de arriba en la web pública
            para ese tamaño. Un tamaño en 0 cae de vuelta al precio de arriba.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {TAMANOS_VEHICULO.map((t) => (
              <div className="field" key={t} style={{ width: 100, margin: 0 }}>
                <label>{TAMANO_LABEL[t]}</label>
                <PriceInput value={tamanoTexto[t]} onChange={(v) => setTamanoTexto((prev) => ({ ...prev, [t]: v }))} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" style={{ marginTop: 0 }} onClick={guardar} disabled={guardando || !hayCambios}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button className="icon-btn" onClick={toggleActivo}>
              {servicio.activo ? "Desactivar" : "Reactivar"}
            </button>
            {msg && <span className="err" style={{ margin: 0, color: msg.ok ? "var(--green)" : undefined }}>{msg.texto}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WebSettingsServiciosTab() {
  const { data, commit } = useApp();
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLInputElement>(null);
  const [precioTexto, setPrecioTexto] = useState("");

  const categorias = Array.from(new Set(data.servicios.map((s) => s.categoria || "Sin categoría")));

  const agregar = async () => {
    const nombre = nombreRef.current?.value.trim() || "";
    if (!nombre) {
      setErr({ msg: "El nombre es obligatorio", ok: false });
      return;
    }
    const nuevo: Servicio = {
      id: uid(),
      nombre,
      categoria: categoriaRef.current?.value.trim() || undefined,
      duracionMinutos: DURACION_DEFAULT,
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
    setErr({ msg: "Servicio/SKU agregado correctamente. Súbele un banner abajo.", ok: true });
    if (nombreRef.current) nombreRef.current.value = "";
    if (categoriaRef.current) categoriaRef.current.value = "";
    setPrecioTexto("");
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 720, margin: "0 0 20px 0" }}>
        <h3>Nuevo servicio / SKU</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          La duración para agendamiento se ajusta después desde Administrador → Agenda; acá se administra lo que ve el
          cliente en la web: nombre, categoría, precio y banner.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Nombre</label>
            <input ref={nombreRef} placeholder="Ej: Encerado" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Categoría</label>
            <input ref={categoriaRef} placeholder="Ej: Servicios Adicionales" />
          </div>
          <div className="field" style={{ width: 160 }}>
            <label>Precio inicial</label>
            <PriceInput value={precioTexto} onChange={setPrecioTexto} />
          </div>
        </div>
        <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
          {err?.msg || ""}
        </div>
        <button className="btn" onClick={agregar}>
          Agregar servicio
        </button>
      </div>

      {categorias.map((cat) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
            {cat}
          </div>
          {data.servicios
            .filter((s) => (s.categoria || "Sin categoría") === cat)
            .map((s) => (
              <ServicioRow key={s.id} servicio={s} />
            ))}
        </div>
      ))}
    </div>
  );
}
