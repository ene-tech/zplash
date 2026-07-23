"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { MODULO_LABELS, ordenarPerfiles, TODOS_LOS_MODULOS } from "@/lib/helpers";
import type { Modulo, PerfilPublico } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Pencil, Trash2 } from "lucide-react";

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
      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {data.perfiles.length === 0 ? (
          <div className="empty">No hay perfiles registrados</div>
        ) : (
          ordenarPerfiles(data.perfiles).map((p) => (
            <PerfilRowMobile key={p.id} perfil={p} puedeAsignarPermisos={puedeAsignarPermisos} onEliminar={() => eliminar(p)} />
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Módulos</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.perfiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <div className="empty">No hay perfiles registrados</div>
                </TableCell>
              </TableRow>
            ) : (
              ordenarPerfiles(data.perfiles).map((p) => (
                <PerfilRow key={p.id} perfil={p} puedeAsignarPermisos={puedeAsignarPermisos} onEliminar={() => eliminar(p)} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Estado y lógica de edición de módulos compartidos entre la fila de tabla
// (desktop) y la tarjeta de lista (mobile) — cada una monta su propia
// instancia (son subárboles DOM independientes, uno oculto vía CSS), así que
// no hay problema en que cada una tenga su propio estado local.
function usePerfilRowState(perfil: PerfilPublico) {
  const { data, commit } = useApp();
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

  return { editandoModulos, setEditandoModulos, reseteando, setReseteando, seleccion, toggleModulo, guardarModulos, guardando };
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
  const { ui, patchUi } = useApp();
  const { editandoModulos, setEditandoModulos, reseteando, setReseteando, seleccion, toggleModulo, guardarModulos, guardando } =
    usePerfilRowState(perfil);

  return (
    <>
      <TableRow>
        <TableCell>{perfil.nombre}</TableCell>
        <TableCell style={{ color: "var(--gray)", fontSize: 13 }}>
          {perfil.modulos.length ? perfil.modulos.map((m) => MODULO_LABELS[m]).join(", ") : "Sin módulos asignados"}
        </TableCell>
        <TableCell className="sticky right-0 z-10 bg-background">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Editar"
              aria-label="Editar"
              onClick={() => patchUi({ modal: { type: "perfil", data: perfil } })}
            >
              <Pencil />
            </Button>
            {puedeAsignarPermisos && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditandoModulos((v) => !v);
                    setReseteando(false);
                  }}
                >
                  {editandoModulos ? "Cancelar" : "Editar módulos"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReseteando((v) => !v);
                    setEditandoModulos(false);
                  }}
                >
                  {reseteando ? "Cancelar" : "Resetear contraseña"}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title="Eliminar"
              aria-label="Eliminar"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onEliminar}
            >
              <Trash2 />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {editandoModulos && (
        <TableRow>
          <TableCell colSpan={3}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 0" }}>
              {TODOS_LOS_MODULOS.map((m) => (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <Checkbox checked={seleccion.has(m)} onCheckedChange={() => toggleModulo(m)} />
                  {MODULO_LABELS[m]}
                </label>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 0 }} onClick={guardarModulos} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar módulos"}
            </button>
          </TableCell>
        </TableRow>
      )}
      {reseteando && (
        <TableRow>
          <TableCell colSpan={3}>
            <ResetClaveForm perfil={perfil} actorId={ui.perfilActual?.id || null} onListo={() => setReseteando(false)} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function PerfilRowMobile({
  perfil,
  puedeAsignarPermisos,
  onEliminar,
}: {
  perfil: PerfilPublico;
  puedeAsignarPermisos: boolean;
  onEliminar: () => void;
}) {
  const { ui, patchUi } = useApp();
  const { editandoModulos, setEditandoModulos, reseteando, setReseteando, seleccion, toggleModulo, guardarModulos, guardando } =
    usePerfilRowState(perfil);

  return (
    <div className="p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{perfil.nombre}</div>
          <div className="truncate text-xs text-muted-foreground">
            {perfil.modulos.length ? perfil.modulos.map((m) => MODULO_LABELS[m]).join(", ") : "Sin módulos asignados"}
          </div>
        </div>
        <MobileRowMenu
          actions={[
            { label: "Editar", icon: <Pencil />, onClick: () => patchUi({ modal: { type: "perfil", data: perfil } }) },
            ...(puedeAsignarPermisos
              ? [
                  {
                    label: editandoModulos ? "Cancelar edición de módulos" : "Editar módulos",
                    onClick: () => {
                      setEditandoModulos((v) => !v);
                      setReseteando(false);
                    },
                  },
                  {
                    label: reseteando ? "Cancelar reseteo de contraseña" : "Resetear contraseña",
                    onClick: () => {
                      setReseteando((v) => !v);
                      setEditandoModulos(false);
                    },
                  },
                ]
              : []),
            { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: onEliminar },
          ]}
        />
      </div>
      {editandoModulos && (
        <div className="mt-3">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {TODOS_LOS_MODULOS.map((m) => (
              <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <Checkbox checked={seleccion.has(m)} onCheckedChange={() => toggleModulo(m)} />
                {MODULO_LABELS[m]}
              </label>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={guardarModulos} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar módulos"}
          </button>
        </div>
      )}
      {reseteando && (
        <div className="mt-3">
          <ResetClaveForm perfil={perfil} actorId={ui.perfilActual?.id || null} onListo={() => setReseteando(false)} />
        </div>
      )}
    </div>
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
    if (claveNueva.length < 6) {
      setMsg({ texto: "La nueva contraseña debe tener al menos 6 caracteres", ok: false });
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
