"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { uid } from "@/lib/helpers";
import type { PlantillaWhatsapp } from "@/types";
import { PlantillaRow } from "./WhatsappPlantillaRow";

const CATEGORIA_DEFAULT = "Proceso de venta";

export default function WebSettingsWhatsappTab() {
  const { data, ui, commit } = useApp();
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLInputElement>(null);
  const puedeBorrar = ui.perfilActual?.modulos.includes("permisos") || false;

  const categorias = Array.from(new Set(data.plantillasWhatsapp.map((p) => p.categoria || "Sin categoría")));

  const agregar = async () => {
    const nombre = nombreRef.current?.value.trim() || "";
    if (!nombre) {
      setErr({ msg: "El nombre de la situación es obligatorio", ok: false });
      return;
    }
    const nueva: PlantillaWhatsapp = {
      id: uid(),
      nombre,
      categoria: categoriaRef.current?.value.trim() || undefined,
      mensaje: "",
      activo: true,
      metaAprobado: false,
    };
    const ok = await commit({ plantillasWhatsapp: [...data.plantillasWhatsapp, nueva] });
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
        <h3>Nueva plantilla de WhatsApp</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Una plantilla por cada situación del proceso de venta o suscripción (confirmación de compra, pago rechazado,
          vencimiento próximo, etc.) o para comunicación de ofertas y servicios. No son plantillas pre-aprobadas de
          Meta (esas se gestionan aparte en Meta Business Manager) — este es el borrador de contenido para cuando se
          conecte el envío automático. Las variables disponibles aparecen como botones sobre el mensaje de cada
          plantilla, más abajo.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label>Situación</label>
            <input ref={nombreRef} placeholder="Ej: Confirmación de compra" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label>Categoría</label>
            <input ref={categoriaRef} placeholder="Ej: Proceso de venta" defaultValue={CATEGORIA_DEFAULT} list="categorias-whatsapp" />
            <datalist id="categorias-whatsapp">
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
          {data.plantillasWhatsapp
            .filter((p) => (p.categoria || "Sin categoría") === cat)
            .map((p) => (
              <PlantillaRow key={p.id} plantilla={p} puedeBorrar={puedeBorrar} />
            ))}
        </div>
      ))}
    </div>
  );
}
