"use client";

import { useState } from "react";
import type { CarpetaBuzon, CondicionFiltroCorreo, ReglaFiltroCorreo } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCIONES, CAMPOS, OPERADORES } from "./filtrosConstantes";
import { Plus, X } from "lucide-react";

export default function EditorReglaFiltro({
  regla,
  carpetas,
  onCancelar,
  onGuardar,
}: {
  regla: ReglaFiltroCorreo;
  carpetas: CarpetaBuzon[];
  onCancelar: () => void;
  onGuardar: (r: ReglaFiltroCorreo) => void;
}) {
  const [r, setR] = useState<ReglaFiltroCorreo>(regla);
  const [err, setErr] = useState("");

  const patchCondicion = (i: number, patch: Partial<CondicionFiltroCorreo>) => {
    setR((prev) => ({ ...prev, condiciones: prev.condiciones.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  };

  const agregarCondicion = () => {
    setR((prev) => ({ ...prev, condiciones: [...prev.condiciones, { campo: "de", operador: "contiene", valor: "" }] }));
  };

  const quitarCondicion = (i: number) => {
    setR((prev) => ({ ...prev, condiciones: prev.condiciones.filter((_, idx) => idx !== i) }));
  };

  const guardar = () => {
    if (!r.nombre.trim()) return setErr("Ponle un nombre a la regla");
    if (!r.condiciones.length || r.condiciones.some((c) => !c.valor.trim())) return setErr("Completa el valor de cada condición");
    if (r.accion === "mover" && !r.carpetaDestino) return setErr("Elige la carpeta de destino");
    setErr("");
    onGuardar(r);
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="grid gap-1.5">
        <Label htmlFor="regla-nombre">Nombre</Label>
        <Input id="regla-nombre" value={r.nombre} onChange={(e) => setR({ ...r, nombre: e.target.value })} placeholder="Ej: Boletas a Contabilidad" />
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label>Condiciones</Label>
          {r.condiciones.length > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <button type="button" className={r.combinador === "todas" ? "font-semibold text-foreground" : "text-muted-foreground"} onClick={() => setR({ ...r, combinador: "todas" })}>
                Todas (Y)
              </button>
              <span className="text-muted-foreground">/</span>
              <button type="button" className={r.combinador === "cualquiera" ? "font-semibold text-foreground" : "text-muted-foreground"} onClick={() => setR({ ...r, combinador: "cualquiera" })}>
                Cualquiera (O)
              </button>
            </div>
          )}
        </div>
        {r.condiciones.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" value={c.campo} onChange={(e) => patchCondicion(i, { campo: e.target.value as CondicionFiltroCorreo["campo"] })}>
              {CAMPOS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
            <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" value={c.operador} onChange={(e) => patchCondicion(i, { operador: e.target.value as CondicionFiltroCorreo["operador"] })}>
              {OPERADORES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
            <Input value={c.valor} onChange={(e) => patchCondicion(i, { valor: e.target.value })} placeholder="texto a buscar" className="flex-1" />
            {r.condiciones.length > 1 && (
              <button type="button" onClick={() => quitarCondicion(i)} className="text-muted-foreground hover:text-destructive">
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={agregarCondicion} className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Plus size={12} /> Agregar condición
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label>Acción</Label>
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={r.accion}
            onChange={(e) => setR({ ...r, accion: e.target.value as ReglaFiltroCorreo["accion"] })}
          >
            {ACCIONES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
        {r.accion === "mover" && (
          <div className="grid gap-1.5">
            <Label>Carpeta destino</Label>
            <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" value={r.carpetaDestino || ""} onChange={(e) => setR({ ...r, carpetaDestino: e.target.value })}>
              <option value="">Elegir...</option>
              {carpetas
                .filter((c) => c.especial !== "inbox")
                .map((c) => (
                  <option key={c.path} value={c.path}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          </div>
        )}
        <label className="flex h-8 items-center gap-1.5 text-sm">
          <input type="checkbox" checked={r.detenerEvaluacion} onChange={(e) => setR({ ...r, detenerEvaluacion: e.target.checked })} />
          Detener evaluación si calza
        </label>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={guardar}>
          Guardar regla
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
