"use client";

import { useEffect, useState } from "react";
import { aplicarFiltrosCorreoAhora, deleteReglasFiltroCorreo, listarReglasFiltroCorreo, upsertReglasFiltroCorreo } from "@/lib/serverActions";
import type { CarpetaBuzon, ReglaFiltroCorreo, ResultadoFiltrosCorreo } from "@/types";
import { Button } from "@/components/ui/button";
import EditorReglaFiltro from "./EditorReglaFiltro";
import { reglaVacia, resumenRegla } from "./filtrosConstantes";
import { ArrowDown, ArrowUp, Pencil, Play, Plus, Trash2 } from "lucide-react";

export default function FiltrosCorreoPanel({ carpetas, onVolver }: { carpetas: CarpetaBuzon[]; onVolver: () => void }) {
  const [reglas, setReglas] = useState<ReglaFiltroCorreo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<ReglaFiltroCorreo | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoFiltrosCorreo | null>(null);

  const recargar = async () => setReglas(await listarReglasFiltroCorreo());

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargando(true);
      const rows = await listarReglasFiltroCorreo();
      if (!cancelado) {
        setReglas(rows);
        setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const reordenar = async (nuevas: ReglaFiltroCorreo[]) => {
    setReglas(nuevas);
    await upsertReglasFiltroCorreo(nuevas);
  };

  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= reglas.length) return;
    const copia = [...reglas];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    reordenar(copia);
  };

  const toggleActiva = (r: ReglaFiltroCorreo) => reordenar(reglas.map((x) => (x.id === r.id ? { ...x, activa: !x.activa } : x)));

  const borrar = async (r: ReglaFiltroCorreo) => {
    await deleteReglasFiltroCorreo([r.id]);
    recargar();
  };

  const guardarEdicion = async (r: ReglaFiltroCorreo) => {
    await upsertReglasFiltroCorreo([r]);
    setEditando(null);
    recargar();
  };

  const aplicarAhora = async () => {
    setAplicando(true);
    setResultado(await aplicarFiltrosCorreoAhora());
    setAplicando(false);
  };

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col overflow-y-auto rounded-lg border border-border p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={onVolver} className="text-sm text-muted-foreground hover:text-foreground">
            ← Volver a la bandeja
          </button>
          <h2 className="mt-1 text-lg font-medium">Filtros</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            No son reglas del servidor de correo (Sieve): corren desde este panel cada 15 minutos sobre los correos no leídos de la Bandeja de entrada, o al apretar &quot;Aplicar ahora&quot;.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={aplicarAhora} disabled={aplicando}>
            <Play size={14} />
            {aplicando ? "Aplicando..." : "Aplicar ahora"}
          </Button>
          <Button size="sm" onClick={() => setEditando(reglaVacia())}>
            <Plus size={14} />
            Nueva regla
          </Button>
        </div>
      </div>

      {resultado && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          {resultado.error ? (
            <span className="text-destructive">{resultado.error}</span>
          ) : (
            <span>
              Revisados: {resultado.revisados} · Movidos: {resultado.movidos} · A papelera: {resultado.aPapelera} · Marcados leídos: {resultado.marcadosLeidos}
            </span>
          )}
        </div>
      )}

      {editando && <EditorReglaFiltro regla={editando} carpetas={carpetas} onCancelar={() => setEditando(null)} onGuardar={guardarEdicion} />}

      {cargando ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : reglas.length === 0 ? (
        <div className="text-sm text-muted-foreground">Sin filtros todavía.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {reglas.map((r, i) => (
            <div key={r.id} className={`flex items-start justify-between gap-3 rounded-lg border border-border p-3 ${r.activa ? "" : "opacity-50"}`}>
              <div className="min-w-0">
                <div className="font-medium">{r.nombre || "(sin nombre)"}</div>
                <div className="text-xs text-muted-foreground">{resumenRegla(r)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => mover(i, -1)} disabled={i === 0} title="Subir">
                  <ArrowUp size={14} />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => mover(i, 1)} disabled={i === reglas.length - 1} title="Bajar">
                  <ArrowDown size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleActiva(r)}>
                  {r.activa ? "Desactivar" : "Activar"}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditando(r)} title="Editar">
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => borrar(r)} title="Borrar">
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
