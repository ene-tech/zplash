"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import type { PerfilPublico } from "@/types";

export default function PerfilModal({ data: p }: { data: PerfilPublico | null }) {
  const { data, ui, commit, patchUi } = useApp();
  const nombreRef = useRef<HTMLInputElement>(null);
  const claveRef = useRef<HTMLInputElement>(null);
  const actorClaveRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Editar un perfil existente solo cambia el nombre (los módulos y la
  // clave se administran desde la misma fila en la pestaña Perfiles, si el
  // actor tiene el módulo "permisos"). Crear uno nuevo pide
  // su clave inicial y, para confirmar que quien lo crea tiene permiso,
  // la contraseña actual de quien está haciendo la acción.
  const guardar = async () => {
    const nombre = nombreRef.current?.value.trim() || "";
    if (!nombre) {
      setErr("El nombre es obligatorio");
      return;
    }
    const dup = data.perfiles.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase() && x.id !== p?.id);
    if (dup) {
      setErr("Ya existe un perfil con ese nombre");
      return;
    }

    if (p) {
      const actualizado: PerfilPublico = { ...p, nombre };
      const ok = await commit({ perfiles: data.perfiles.map((x) => (x.id === p.id ? actualizado : x)) });
      if (!ok) {
        setErr("No se pudo guardar (sin conexión). Intenta de nuevo.");
        return;
      }
      patchUi({ modal: null });
      return;
    }

    const clave = claveRef.current?.value.trim() || "";
    const actorClave = actorClaveRef.current?.value || "";
    if (!clave || clave.length < 4) {
      setErr("La contraseña inicial debe tener al menos 4 caracteres");
      return;
    }
    if (!ui.perfilActual || !actorClave) {
      setErr("Ingresa tu contraseña para confirmar");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/perfiles/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorId: ui.perfilActual.id,
          actorClave,
          nombre,
          clave,
          modulos: [],
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error || "No se pudo crear el perfil");
        return;
      }
      // El perfil ya quedó creado en el servidor; esto solo refleja el
      // cambio en el estado local para que aparezca sin recargar la página.
      const nuevo: PerfilPublico = { id: json.id, nombre, modulos: [] };
      await commit({ perfiles: [...data.perfiles, nuevo] });
      patchUi({ modal: null });
    } catch {
      setErr("No se pudo crear el perfil (sin conexión). Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal">
      <h3>{p ? "Editar perfil" : "Nuevo perfil"}</h3>
      <div className="field">
        <label>Nombre</label>
        <input ref={nombreRef} defaultValue={p?.nombre || ""} />
      </div>
      {!p && (
        <>
          <div className="field">
            <label>Contraseña inicial</label>
            <input ref={claveRef} type="password" maxLength={12} />
          </div>
          <div className="field">
            <label>Tu contraseña (para confirmar)</label>
            <input ref={actorClaveRef} type="password" maxLength={12} />
          </div>
          <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13 }}>
            El perfil se crea sin módulos asignados — edítalo desde la pestaña Perfiles para darle acceso.
          </div>
        </>
      )}
      <div className="err">{err}</div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => patchUi({ modal: null })}>
          Cancelar
        </button>
        <button className="btn" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
