"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { mantencionStatus, uid } from "@/lib/helpers";
import type { Maquinaria } from "@/types";

export default function MaquinariasTab() {
  const { data, ui, patchUi, commit } = useApp();
  const nombreRef = useRef<HTMLInputElement>(null);
  const tipoRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const puedeBorrar = ui.perfilActual?.modulos.includes("permisos") || false;

  const agregarMaquinaria = async () => {
    const nombre = (nombreRef.current?.value.trim() || "").toUpperCase();
    if (!nombre) {
      setErr({ msg: "Escribe el nombre de la máquina", ok: false });
      return;
    }
    if (data.maquinarias.some((m) => m.nombre.toLowerCase() === nombre.toLowerCase())) {
      setErr({ msg: "Ya existe una máquina con ese nombre", ok: false });
      return;
    }
    const nueva: Maquinaria = {
      id: uid(),
      nombre,
      tipo: tipoRef.current?.value.trim() || undefined,
      activo: true,
      creadoEn: new Date().toISOString(),
      creadoPor: ui.perfilActual?.nombre || undefined,
    };
    const ok = await commit({ maquinarias: [...data.maquinarias, nueva] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Máquina agregada correctamente", ok: true });
    if (nombreRef.current) nombreRef.current.value = "";
    if (tipoRef.current) tipoRef.current.value = "";
  };

  const toggleActivo = (maquinaria: Maquinaria) => {
    const actualizada = { ...maquinaria, activo: !maquinaria.activo };
    commit({ maquinarias: data.maquinarias.map((m) => (m.id === maquinaria.id ? actualizada : m)) });
  };

  const borrarMaquinaria = (maquinaria: Maquinaria) => {
    const enUso = data.registrosMantencion.filter((r) => r.maquinariaId === maquinaria.id).length;
    if (enUso > 0) {
      setErr({ msg: `No se puede borrar: "${maquinaria.nombre}" tiene ${enUso} mantención(es) registrada(s).`, ok: false });
      return;
    }
    setErr(null);
    commit({ maquinarias: data.maquinarias.filter((m) => m.id !== maquinaria.id) }).then((ok) => {
      setErr(ok ? { msg: "Máquina borrada", ok: true } : { msg: "No se pudo borrar la máquina", ok: false });
    });
  };

  return (
    <div className="modal" style={{ maxWidth: 560, margin: 0 }}>
      <h3>Máquinas del túnel</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Cada máquina agrupa su propia bitácora de mantenciones (ver pestaña Registros de Mantención). Agrega una
        máquina nueva cuando se instale un equipo, o desactívala si se da de baja.
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Nombre</label>
          <input ref={nombreRef} placeholder="Ej: Cepillo lateral 1" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Tipo (opcional)</label>
          <input ref={tipoRef} placeholder="Ej: Cepillo, secador, bomba" />
        </div>
      </div>
      <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
        {err?.msg || ""}
      </div>
      <button className="btn" onClick={agregarMaquinaria}>
        Agregar máquina
      </button>

      <div style={{ marginTop: 22 }}>
        {data.maquinarias
          .slice()
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
          .map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 0",
                borderBottom: "1px solid var(--border)",
                opacity: m.activo ? 1 : 0.5,
              }}
            >
              <div style={{ flex: 1 }}>
                {m.nombre}
                {m.tipo && <span style={{ color: "var(--gray)", fontSize: 13 }}> — {m.tipo}</span>}
                {(() => {
                  const status = mantencionStatus(m, data.registrosMantencion, data.ingresos);
                  return status ? <span className={`status-pill ${status.cls}`} style={{ marginLeft: 10 }}>{status.label}</span> : null;
                })()}
              </div>
              <button className="icon-btn" onClick={() => patchUi({ modal: { type: "maquinariaFicha", data: m } })}>
                Ver ficha
              </button>
              <button className="icon-btn" onClick={() => toggleActivo(m)}>
                {m.activo ? "Desactivar" : "Reactivar"}
              </button>
              {puedeBorrar && (
                <button className="icon-btn" onClick={() => borrarMaquinaria(m)}>
                  Borrar
                </button>
              )}
            </div>
          ))}
        {data.maquinarias.length === 0 && <div className="empty">Todavía no hay máquinas registradas</div>}
      </div>
    </div>
  );
}
