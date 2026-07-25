"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { uid } from "@/lib/helpers";
import type { PlantillaCorreo } from "@/types";

const CATEGORIA_DEFAULT = "Proceso de venta";

function PlantillaRow({ plantilla, puedeBorrar }: { plantilla: PlantillaCorreo; puedeBorrar: boolean }) {
  const { data, commit } = useApp();
  const [asunto, setAsunto] = useState(plantilla.asunto);
  const [cuerpo, setCuerpo] = useState(plantilla.cuerpo);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const hayCambios = asunto !== plantilla.asunto || cuerpo !== plantilla.cuerpo;

  const guardar = async () => {
    setGuardando(true);
    const ok = await commit({
      plantillasCorreo: data.plantillasCorreo.map((p) => (p.id === plantilla.id ? { ...p, asunto, cuerpo } : p)),
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Guardado" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  const toggleActivo = () => {
    commit({ plantillasCorreo: data.plantillasCorreo.map((p) => (p.id === plantilla.id ? { ...p, activo: !p.activo } : p)) });
  };

  const borrar = () => {
    commit({ plantillasCorreo: data.plantillasCorreo.filter((p) => p.id !== plantilla.id) });
  };

  return (
    <div className="vehicle-card" style={{ opacity: plantilla.activo ? 1 : 0.6, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{plantilla.nombre}</div>
      <div className="field" style={{ margin: "0 0 8px" }}>
        <label>Asunto</label>
        <input value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Asunto del correo" />
      </div>
      <div className="field" style={{ margin: "0 0 8px" }}>
        <label>Cuerpo</label>
        <textarea rows={4} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} placeholder="Cuerpo del correo" />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" style={{ marginTop: 0 }} onClick={guardar} disabled={guardando || !hayCambios}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        <button className="icon-btn" onClick={toggleActivo}>
          {plantilla.activo ? "Desactivar" : "Reactivar"}
        </button>
        {puedeBorrar && (
          <button className="icon-btn" onClick={borrar}>
            Borrar
          </button>
        )}
        {msg && <span className="err" style={{ margin: 0, color: msg.ok ? "var(--green)" : undefined }}>{msg.texto}</span>}
      </div>
    </div>
  );
}

export default function WebSettingsMailTab() {
  const { data, ui, commit } = useApp();
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLInputElement>(null);
  const puedeBorrar = ui.perfilActual?.modulos.includes("permisos") || false;

  const categorias = Array.from(new Set(data.plantillasCorreo.map((p) => p.categoria || "Sin categoría")));

  const agregar = async () => {
    const nombre = nombreRef.current?.value.trim() || "";
    if (!nombre) {
      setErr({ msg: "El nombre de la situación es obligatorio", ok: false });
      return;
    }
    const nueva: PlantillaCorreo = {
      id: uid(),
      nombre,
      categoria: categoriaRef.current?.value.trim() || undefined,
      asunto: "",
      cuerpo: "",
      activo: true,
    };
    const ok = await commit({ plantillasCorreo: [...data.plantillasCorreo, nueva] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Plantilla agregada correctamente", ok: true });
    if (nombreRef.current) nombreRef.current.value = "";
    if (categoriaRef.current) categoriaRef.current.value = "";
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 720, margin: "0 0 20px 0" }}>
        <h3>Nueva plantilla de correo</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Una plantilla por cada situación del proceso de venta o suscripción (confirmación de compra, pago rechazado,
          vencimiento próximo, etc.) o para comunicación de ofertas y servicios. En el cuerpo puedes usar{" "}
          <code>{"{{nombre}}"}</code>, <code>{"{{patente}}"}</code>, <code>{"{{plan}}"}</code>, <code>{"{{monto}}"}</code> y{" "}
          <code>{"{{fechaVencimiento}}"}</code>.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label>Situación</label>
            <input ref={nombreRef} placeholder="Ej: Confirmación de compra" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label>Categoría</label>
            <input ref={categoriaRef} placeholder="Ej: Proceso de venta" defaultValue={CATEGORIA_DEFAULT} list="categorias-mail" />
            <datalist id="categorias-mail">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
          {err?.msg || ""}
        </div>
        <button className="btn" onClick={agregar}>
          Agregar plantilla
        </button>
      </div>

      {categorias.map((cat) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
            {cat}
          </div>
          {data.plantillasCorreo
            .filter((p) => (p.categoria || "Sin categoría") === cat)
            .map((p) => (
              <PlantillaRow key={p.id} plantilla={p} puedeBorrar={puedeBorrar} />
            ))}
        </div>
      ))}
    </div>
  );
}
