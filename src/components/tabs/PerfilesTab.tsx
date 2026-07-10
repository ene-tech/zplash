"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { MODULO_LABELS, TODOS_LOS_MODULOS } from "@/lib/helpers";
import type { Modulo, PerfilPublico } from "@/types";

export default function PerfilesTab() {
  const { data, ui, commit, patchUi } = useApp();
  const puedeAsignarPermisos = ui.perfilActual?.modulos.includes("permisos") || false;

  const eliminar = (p: PerfilPublico) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar a ${p.nombre}? Esta acción no se puede deshacer.`,
        onConfirm: () => {
          commit({ perfiles: data.perfiles.filter((x) => x.id !== p.id) });
        },
      },
    });
  };

  return (
    <div>
      {puedeAsignarPermisos && (
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Acá se administra cada perfil: nombre, qué módulos ve al iniciar sesión, y se puede resetear su contraseña.
        </div>
      )}
      <div className="toolbar">
        <button className="btn" onClick={() => patchUi({ modal: { type: "perfil", data: null } })}>
          + Nuevo perfil
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Módulos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.perfiles.length === 0 ? (
            <tr>
              <td colSpan={3}>
                <div className="empty">No hay perfiles registrados</div>
              </td>
            </tr>
          ) : (
            data.perfiles.map((p) => (
              <PerfilRow key={p.id} perfil={p} puedeAsignarPermisos={puedeAsignarPermisos} onEliminar={() => eliminar(p)} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PerfilRow({
  perfil,
  puedeAsignarPermisos,
  onEliminar,
}: {
  perfil: PerfilPublico;
  puedeAsignarPermisos: boolean;
  onEliminar: () => void;
}) {
  const { data, ui, commit, patchUi } = useApp();
  const [editandoModulos, setEditandoModulos] = useState(false);
  const [reseteando, setReseteando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<Modulo>>(new Set(perfil.modulos));
  const [guardando, setGuardando] = useState(false);

  const toggleModulo = (m: Modulo) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const guardarModulos = async () => {
    setGuardando(true);
    const actualizado: PerfilPublico = { ...perfil, modulos: Array.from(seleccion) };
    await commit({ perfiles: data.perfiles.map((x) => (x.id === perfil.id ? actualizado : x)) });
    setGuardando(false);
    setEditandoModulos(false);
  };

  return (
    <>
      <tr>
        <td>{perfil.nombre}</td>
        <td style={{ color: "var(--gray)", fontSize: 13 }}>
          {perfil.modulos.length ? perfil.modulos.map((m) => MODULO_LABELS[m]).join(", ") : "Sin módulos asignados"}
        </td>
        <td className="row-actions">
          <button className="icon-btn" onClick={() => patchUi({ modal: { type: "perfil", data: perfil } })}>
            Editar
          </button>
          {puedeAsignarPermisos && (
            <>
              <button
                className="icon-btn"
                onClick={() => {
                  setEditandoModulos((v) => !v);
                  setReseteando(false);
                }}
              >
                {editandoModulos ? "Cancelar" : "Editar módulos"}
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  setReseteando((v) => !v);
                  setEditandoModulos(false);
                }}
              >
                {reseteando ? "Cancelar" : "Resetear contraseña"}
              </button>
            </>
          )}
          <button className="icon-btn" onClick={onEliminar}>
            Eliminar
          </button>
        </td>
      </tr>
      {editandoModulos && (
        <tr>
          <td colSpan={3}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 0" }}>
              {TODOS_LOS_MODULOS.map((m) => (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={seleccion.has(m)} onChange={() => toggleModulo(m)} />
                  {MODULO_LABELS[m]}
                </label>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 0 }} onClick={guardarModulos} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar módulos"}
            </button>
          </td>
        </tr>
      )}
      {reseteando && (
        <tr>
          <td colSpan={3}>
            <ResetClaveForm perfil={perfil} actorId={ui.perfilActual?.id || null} onListo={() => setReseteando(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

function ResetClaveForm({
  perfil,
  actorId,
  onListo,
}: {
  perfil: PerfilPublico;
  actorId: string | null;
  onListo: () => void;
}) {
  const nuevaClaveRef = useRef<HTMLInputElement>(null);
  const actorClaveRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const claveNueva = nuevaClaveRef.current?.value || "";
    const actorClaveActual = actorClaveRef.current?.value || "";
    if (!actorId) return;
    if (claveNueva.length < 4) {
      setMsg({ texto: "La nueva contraseña debe tener al menos 4 caracteres", ok: false });
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/perfiles/cambiar-clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, actorClaveActual, objetivoId: perfil.id, claveNueva }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setMsg({ texto: json.error || "No se pudo cambiar la contraseña", ok: false });
        return;
      }
      setMsg({ texto: `Contraseña de ${perfil.nombre} actualizada correctamente`, ok: true });
      setTimeout(onListo, 1200);
    } catch {
      setMsg({ texto: "No se pudo cambiar la contraseña (sin conexión). Intenta de nuevo.", ok: false });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", padding: "10px 0" }}>
      <div className="field" style={{ margin: 0 }}>
        <label>Nueva contraseña de {perfil.nombre}</label>
        <input ref={nuevaClaveRef} type="password" maxLength={12} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Tu contraseña (para confirmar)</label>
        <input ref={actorClaveRef} type="password" maxLength={12} />
      </div>
      <button className="btn" style={{ marginTop: 0 }} onClick={enviar} disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </button>
      {msg && (
        <div className="err" style={{ color: msg.ok ? "var(--green)" : undefined, width: "100%" }}>
          {msg.texto}
        </div>
      )}
    </div>
  );
}
