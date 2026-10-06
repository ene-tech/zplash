"use client";

import { useState } from "react";
import { toast } from "sonner";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { fmtCLP } from "@/lib/helpers";
import { costoPorLitro } from "@/lib/logic";
import { eliminarFormula, guardarFormula } from "@/lib/serverActions";
import type { Formula } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, X } from "lucide-react";
import { fmtCantidad, parseDecimal, SELECT_CLASS, type FabricacionTabProps } from "./shared";

export default function FormulasTab({ datos, recargar }: FabricacionTabProps) {
  const { data, patchUi } = useApp();
  const [editando, setEditando] = useState<Formula | null>(null);
  const insumoNombre = (id: string) => data.insumos.find((i) => i.id === id)?.nombre || "(insumo borrado)";
  const mpPorId = new Map(datos.materiasPrimas.map((m) => [m.id, m]));

  const formulas = [...datos.formulas].sort((a, b) => insumoNombre(a.insumoId).localeCompare(insumoNombre(b.insumoId)));

  const eliminar = (f: Formula) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar la fórmula de ${insumoNombre(f.insumoId)}? Las recepciones ya registradas no cambian.`,
        danger: true,
        onConfirm: async () => {
          const r = await eliminarFormula(f.id);
          if (!r.ok) return void toast.error(r.error);
          await recargar();
        },
      },
    });
  };

  return (
    <div>
      <div className="toolbar">
        <p className="text-sm text-muted-foreground" style={{ flex: 1 }}>
          Cada componente es un % del litro terminado: 100 L con un componente al 2% usan 2 unidades de esa materia prima.
        </p>
        <button className="btn" onClick={() => setEditando({ id: "", insumoId: "", maquilaPorLitro: 0, componentes: [] })}>
          + Nueva fórmula
        </button>
      </div>

      {formulas.length === 0 ? (
        <div className="empty">Todavía no hay fórmulas</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {formulas.map((f) => {
            const costo = costoPorLitro(f, datos.materiasPrimas);
            return (
              <div key={f.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <strong>{insumoNombre(f.insumoId)}</strong>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" title="Editar" aria-label="Editar" onClick={() => setEditando(f)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Eliminar"
                      aria-label="Eliminar"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => eliminar(f)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {f.componentes.map((c) => {
                  const mp = mpPorId.get(c.materiaPrimaId);
                  return (
                    <div key={c.id} className="flex justify-between">
                      <span>
                        {mp?.nombre || "?"} <span className="text-muted-foreground">({mp?.propia ? "nuestra" : "fábrica"})</span>
                      </span>
                      <span>{fmtCantidad(c.porcentaje)}%</span>
                    </div>
                  );
                })}
                <div className="mt-2 border-t border-border pt-2 text-muted-foreground">
                  Costo por litro: maquila {fmtCLP(f.maquilaPorLitro)} + fábrica {fmtCLP(Math.round(costo.fabrica))} + propias{" "}
                  {fmtCLP(Math.round(costo.propias))} = <strong className="text-foreground">{fmtCLP(Math.round(costo.total))}</strong>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editando && <FormulaDialog formula={editando} onClose={() => setEditando(null)} {...{ datos, recargar }} />}
    </div>
  );
}

interface FilaComponente {
  materiaPrimaId: string;
  porcentaje: string;
}

function FormulaDialog({ formula, onClose, datos, recargar }: { formula: Formula; onClose: () => void } & FabricacionTabProps) {
  const { data } = useApp();
  const [insumoId, setInsumoId] = useState(formula.insumoId);
  const [maquila, setMaquila] = useState(formula.maquilaPorLitro ? String(formula.maquilaPorLitro) : "");
  const [filas, setFilas] = useState<FilaComponente[]>(
    formula.componentes.map((c) => ({ materiaPrimaId: c.materiaPrimaId, porcentaje: String(c.porcentaje).replace(".", ",") }))
  );
  const [guardando, setGuardando] = useState(false);

  // Un producto con fórmula no se ofrece para una segunda (insumo_id es unique).
  const conFormula = new Set(datos.formulas.filter((f) => f.id !== formula.id).map((f) => f.insumoId));
  const insumos = data.insumos.filter((i) => i.activo && !conFormula.has(i.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const materias = datos.materiasPrimas.filter((m) => m.activa || filas.some((f) => f.materiaPrimaId === m.id));
  const suma = filas.reduce((s, f) => s + parseDecimal(f.porcentaje), 0);

  const setFila = (i: number, cambio: Partial<FilaComponente>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const guardar = async () => {
    setGuardando(true);
    const r = await guardarFormula({
      id: formula.id,
      insumoId,
      maquilaPorLitro: Number(maquila) || 0,
      componentes: filas.map((f) => ({ id: "", materiaPrimaId: f.materiaPrimaId, porcentaje: parseDecimal(f.porcentaje) })),
    });
    setGuardando(false);
    if (!r.ok) return toast.error(r.error);
    await recargar();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{formula.id ? "Editar fórmula" : "Nueva fórmula"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="f-insumo">Producto terminado (insumo)</Label>
            <select id="f-insumo" className={SELECT_CLASS} value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
              <option value="">Elegir…</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Maquila (mano de obra) por litro</Label>
            <PriceInput value={maquila} onChange={setMaquila} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm" />
          </div>
          <div className="grid gap-1.5">
            <Label>Componentes</Label>
            {filas.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <select className={SELECT_CLASS} value={f.materiaPrimaId} onChange={(e) => setFila(i, { materiaPrimaId: e.target.value })}>
                  <option value="">Materia prima…</option>
                  {materias.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} ({m.propia ? "nuestra" : "fábrica"})
                    </option>
                  ))}
                </select>
                <Input
                  className="w-24"
                  inputMode="decimal"
                  placeholder="%"
                  value={f.porcentaje}
                  onChange={(e) => setFila(i, { porcentaje: e.target.value })}
                />
                <span className="text-sm">%</span>
                <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setFilas(filas.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setFilas([...filas, { materiaPrimaId: "", porcentaje: "" }])}>
                + Componente
              </Button>
              <span className={`text-sm ${suma > 100 ? "text-destructive" : "text-muted-foreground"}`}>Suma: {fmtCantidad(suma)}%</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
