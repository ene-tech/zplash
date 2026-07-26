"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { uid } from "@/lib/helpers";
import type { PlantillaWhatsapp } from "@/types";

const CATEGORIA_DEFAULT = "Proceso de venta";

const VARIABLES_DISPONIBLES = ["nombre", "patente", "plan", "monto", "fechaVencimiento", "montoOferta", "diasValidez"];

export function BadgeAprobadoMeta({ aprobado }: { aprobado: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        color: "#fff",
        background: aprobado ? "var(--green)" : "var(--gray)",
      }}
    >
      {aprobado ? "Aprobado en Meta" : "Pendiente en Meta"}
    </span>
  );
}

function PlantillaRow({ plantilla, puedeBorrar }: { plantilla: PlantillaWhatsapp; puedeBorrar: boolean }) {
  const { data, commit } = useApp();
  const [mensaje, setMensaje] = useState(plantilla.mensaje);
  const [metaNombre, setMetaNombre] = useState(plantilla.metaNombre || "");
  const [metaIdioma, setMetaIdioma] = useState(plantilla.metaIdioma || "es");
  const [metaVariables, setMetaVariables] = useState((plantilla.metaVariables || []).join(", "));
  const [metaAprobado, setMetaAprobado] = useState(plantilla.metaAprobado);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const hayCambios =
    mensaje !== plantilla.mensaje ||
    metaNombre !== (plantilla.metaNombre || "") ||
    metaIdioma !== (plantilla.metaIdioma || "es") ||
    metaVariables !== (plantilla.metaVariables || []).join(", ") ||
    metaAprobado !== plantilla.metaAprobado;

  const guardar = async () => {
    setGuardando(true);
    const variables = metaVariables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const ok = await commit({
      plantillasWhatsapp: data.plantillasWhatsapp.map((p) =>
        p.id === plantilla.id
          ? {
              ...p,
              mensaje,
              metaNombre: metaNombre.trim() || undefined,
              metaIdioma: metaIdioma.trim() || undefined,
              metaVariables: variables.length ? variables : undefined,
              metaAprobado,
            }
          : p
      ),
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Guardado" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  const toggleActivo = () => {
    commit({ plantillasWhatsapp: data.plantillasWhatsapp.map((p) => (p.id === plantilla.id ? { ...p, activo: !p.activo } : p)) });
  };

  const borrar = () => {
    commit({ plantillasWhatsapp: data.plantillasWhatsapp.filter((p) => p.id !== plantilla.id) });
  };

  return (
    <div className="vehicle-card" style={{ opacity: plantilla.activo ? 1 : 0.6, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>{plantilla.nombre}</div>
        <BadgeAprobadoMeta aprobado={plantilla.metaAprobado} />
      </div>
      <div className="field" style={{ margin: "0 0 8px" }}>
        <label>Mensaje</label>
        <textarea rows={4} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Mensaje de WhatsApp" />
      </div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, margin: "0 0 8px" }}>
        Para conectar esta situación a un envío automático (Reglas WhatsApp), indica el template ya aprobado en Meta
        Business Manager:
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
          <label>Nombre del template en Meta</label>
          <input value={metaNombre} onChange={(e) => setMetaNombre(e.target.value)} placeholder="Ej: oferta_retorno" />
        </div>
        <div className="field" style={{ width: 100, margin: 0 }}>
          <label>Idioma</label>
          <input value={metaIdioma} onChange={(e) => setMetaIdioma(e.target.value)} placeholder="es" />
        </div>
      </div>
      <div className="field" style={{ margin: "0 0 8px" }}>
        <label>Variables del template, en orden (separadas por coma)</label>
        <input
          value={metaVariables}
          onChange={(e) => setMetaVariables(e.target.value)}
          placeholder={VARIABLES_DISPONIBLES.join(", ")}
        />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, marginBottom: 8 }}>
        <input type="checkbox" checked={metaAprobado} onChange={(e) => setMetaAprobado(e.target.checked)} />
        Confirmo que este template ya está Aprobado en Meta Business Manager
      </label>
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
          conecte el envío automático. Variables disponibles: <code>{"{{nombre}}"}</code>, <code>{"{{patente}}"}</code>,{" "}
          <code>{"{{plan}}"}</code>, <code>{"{{monto}}"}</code> y <code>{"{{fechaVencimiento}}"}</code>.
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
