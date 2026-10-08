"use client";

import { useState } from "react";
import { toast } from "sonner";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { fmtCLP } from "@/lib/helpers";
import { costoEstimadoPorUnidad } from "@/lib/logic";
import { eliminarFormula, eliminarPresentacion, guardarFormula, guardarPresentacion } from "@/lib/serverActions";
import type { Formula, Presentacion } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, X } from "lucide-react";
import SelectFab from "./SelectFab";
import { fmtCantidad, fmtFormato, parseDecimal, type FabricacionTabProps } from "./shared";

export default function FormulasTab({ datos, recargar }: FabricacionTabProps) {
  const { data, patchUi } = useApp();
  const [editando, setEditando] = useState<Formula | null>(null);
  const [presEditando, setPresEditando] = useState<Presentacion | null>(null);
  const mpPorId = new Map(datos.materiasPrimas.map((m) => [m.id, m]));
  const destinoNombre = (p: Presentacion) =>
    p.productoId
      ? data.productos.find((x) => x.id === p.productoId)?.detalle || "(producto borrado)"
      : data.insumos.find((x) => x.id === p.insumoId)?.nombre || "(insumo borrado)";

  const confirmar = (mensaje: string, accion: () => Promise<{ ok: boolean; error?: string }>) =>
    patchUi({
      modal: {
        type: "confirm",
        mensaje,
        danger: true,
        onConfirm: async () => {
          const r = await accion();
          if (!r.ok) return void toast.error(r.error || "No se pudo eliminar");
          await recargar();
        },
      },
    });

  return (
    <div>
      <div className="toolbar">
        <p className="text-sm text-muted-foreground" style={{ flex: 1 }}>
          La fórmula es la mezcla en % del volumen. Cada presentación (20 L, 1 L, 500 ml…) dice a qué producto o insumo suma stock, su maquila
          por unidad y sus envases.
        </p>
        <button className="btn" onClick={() => setEditando({ id: "", nombre: "", componentes: [] })}>
          + Nueva fórmula
        </button>
      </div>

      {datos.formulas.length === 0 ? (
        <div className="empty">Todavía no hay fórmulas</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {datos.formulas.map((f) => {
            const suma = f.componentes.reduce((s, c) => s + c.porcentaje, 0);
            const pres = datos.presentaciones.filter((p) => p.formulaId === f.id);
            return (
              <div key={f.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <strong>{f.nombre}</strong>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" title="Editar fórmula" aria-label="Editar fórmula" onClick={() => setEditando(f)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Eliminar fórmula"
                      aria-label="Eliminar fórmula"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => confirmar(`¿Eliminar la fórmula ${f.nombre} y sus presentaciones? Las recepciones ya registradas no cambian.`, () => eliminarFormula(f.id))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {f.componentes.map((c) => (
                  <div key={c.id} className="flex justify-between">
                    <span>{mpPorId.get(c.materiaPrimaId)?.nombre || "?"}</span>
                    <span>{fmtCantidad(c.porcentaje)}%</span>
                  </div>
                ))}
                <div className={`text-right ${Math.abs(suma - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>Suma {fmtCantidad(suma)}%</div>
                {f.notas && <div className="mt-1 text-muted-foreground">{f.notas}</div>}

                <div className="mt-3 border-t border-border pt-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">Presentaciones</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPresEditando({ id: "", formulaId: f.id, mlPorUnidad: 0, maquilaPorUnidad: 0, activa: true, componentes: [] })}
                    >
                      + Presentación
                    </Button>
                  </div>
                  {pres.length === 0 && <div className="text-muted-foreground">Sin presentaciones: no se puede recibir todavía.</div>}
                  {pres.map((p) => {
                    const costo = costoEstimadoPorUnidad(p, f, datos.materiasPrimas, datos.lotes);
                    return (
                      <div key={p.id} className={`flex items-start justify-between gap-2 border-b border-border py-1.5 ${p.activa ? "" : "opacity-50"}`}>
                        <div>
                          <div>
                            {destinoNombre(p)} <span className="text-muted-foreground">· {fmtFormato(p.mlPorUnidad)} · {p.productoId ? "tienda" : "insumo"}</span>
                          </div>
                          <div className="text-muted-foreground">
                            Maquila {fmtCLP(p.maquilaPorUnidad)}
                            {p.componentes.length > 0 &&
                              ` · ${p.componentes.map((c) => `${fmtCantidad(c.cantidadPorUnidad)} ${mpPorId.get(c.materiaPrimaId)?.nombre || "?"}`).join(", ")}`}
                          </div>
                          <div className="text-muted-foreground">
                            Costo estimado por unidad: <strong className="text-foreground">{fmtCLP(costo.total)}</strong>
                            {costo.sinPrecio && <span className="text-destructive"> (falta costo de alguna materia prima)</span>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-sm" aria-label="Editar presentación" onClick={() => setPresEditando(p)}>
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Eliminar presentación"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => confirmar(`¿Eliminar la presentación de ${destinoNombre(p)}?`, () => eliminarPresentacion(p.id))}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editando && <FormulaDialog formula={editando} onClose={() => setEditando(null)} datos={datos} recargar={recargar} />}
      {presEditando && <PresentacionDialog pres={presEditando} onClose={() => setPresEditando(null)} datos={datos} recargar={recargar} />}
    </div>
  );
}

interface FilaComponente {
  materiaPrimaId: string;
  valor: string;
}

function FilasComponentes({
  filas,
  setFilas,
  materias,
  sufijo,
  agregar,
}: {
  filas: FilaComponente[];
  setFilas: (f: FilaComponente[]) => void;
  materias: { id: string; nombre: string; unidad: string }[];
  sufijo: (mpId: string) => string;
  agregar: string;
}) {
  const setFila = (i: number, cambio: Partial<FilaComponente>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  return (
    <>
      {filas.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <SelectFab
            className="w-full min-w-0 flex-1"
            value={f.materiaPrimaId}
            onChange={(v) => setFila(i, { materiaPrimaId: v })}
            placeholder="Elegir…"
            opciones={materias.map((m) => ({ value: m.id, label: m.nombre }))}
          />
          <Input className="w-24" inputMode="decimal" value={f.valor} onChange={(e) => setFila(i, { valor: e.target.value })} />
          <span className="w-8 text-sm">{sufijo(f.materiaPrimaId)}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setFilas(filas.filter((_, j) => j !== i))}>
            <X />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="outline" size="sm" onClick={() => setFilas([...filas, { materiaPrimaId: "", valor: "" }])}>
          {agregar}
        </Button>
      </div>
    </>
  );
}

const aTexto = (n: number) => String(n).replace(".", ",");

function FormulaDialog({ formula, onClose, datos, recargar }: { formula: Formula; onClose: () => void } & FabricacionTabProps) {
  const [nombre, setNombre] = useState(formula.nombre);
  const [notas, setNotas] = useState(formula.notas || "");
  const [filas, setFilas] = useState<FilaComponente[]>(formula.componentes.map((c) => ({ materiaPrimaId: c.materiaPrimaId, valor: aTexto(c.porcentaje) })));
  const [guardando, setGuardando] = useState(false);
  const materias = datos.materiasPrimas.filter((m) => m.activa || filas.some((f) => f.materiaPrimaId === m.id));
  const suma = filas.reduce((s, f) => s + parseDecimal(f.valor), 0);

  const guardar = async () => {
    setGuardando(true);
    const r = await guardarFormula({
      id: formula.id,
      nombre,
      notas,
      componentes: filas.map((f) => ({ id: "", materiaPrimaId: f.materiaPrimaId, porcentaje: parseDecimal(f.valor) })),
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
            <Label htmlFor="f-nombre">Nombre</Label>
            <Input id="f-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Limpia vidrios" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>Mezcla (% del volumen)</Label>
            <FilasComponentes filas={filas} setFilas={setFilas} materias={materias} sufijo={() => "%"} agregar="+ Componente" />
            <span className={`text-right text-sm ${suma > 100 ? "text-destructive" : "text-muted-foreground"}`}>Suma: {fmtCantidad(suma)}%</span>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-notas">Notas</Label>
            <Input id="f-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
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

function PresentacionDialog({ pres, onClose, datos, recargar }: { pres: Presentacion; onClose: () => void } & FabricacionTabProps) {
  const { data } = useApp();
  const [destino, setDestino] = useState(pres.productoId ? `p:${pres.productoId}` : pres.insumoId ? `i:${pres.insumoId}` : "");
  const [ml, setMl] = useState(pres.mlPorUnidad ? aTexto(pres.mlPorUnidad) : "");
  const [maquila, setMaquila] = useState(pres.maquilaPorUnidad ? String(pres.maquilaPorUnidad) : "");
  const [activa, setActiva] = useState(pres.activa);
  const [filas, setFilas] = useState<FilaComponente[]>(pres.componentes.map((c) => ({ materiaPrimaId: c.materiaPrimaId, valor: aTexto(c.cantidadPorUnidad) })));
  const [guardando, setGuardando] = useState(false);

  // Un producto/insumo con presentación no se ofrece para otra (son unique).
  const ocupados = new Set(datos.presentaciones.filter((p) => p.id !== pres.id).flatMap((p) => [p.productoId, p.insumoId]));
  const prods = data.productos.filter((p) => (p.activo || `p:${p.id}` === destino) && !ocupados.has(p.id)).sort((a, b) => a.detalle.localeCompare(b.detalle));
  const ins = data.insumos.filter((i) => (i.activo || `i:${i.id}` === destino) && !ocupados.has(i.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const materias = datos.materiasPrimas.filter((m) => m.activa || filas.some((f) => f.materiaPrimaId === m.id));
  const unidad = (id: string) => datos.materiasPrimas.find((m) => m.id === id)?.unidad || "";

  const guardar = async () => {
    setGuardando(true);
    const r = await guardarPresentacion({
      id: pres.id,
      formulaId: pres.formulaId,
      productoId: destino.startsWith("p:") ? destino.slice(2) : undefined,
      insumoId: destino.startsWith("i:") ? destino.slice(2) : undefined,
      mlPorUnidad: parseDecimal(ml),
      maquilaPorUnidad: Number(maquila) || 0,
      activa,
      componentes: filas.map((f) => ({ id: "", materiaPrimaId: f.materiaPrimaId, cantidadPorUnidad: parseDecimal(f.valor) })),
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
          <DialogTitle>{pres.id ? "Editar presentación" : "Nueva presentación"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="p-destino">Suma stock a</Label>
            <SelectFab
              id="p-destino"
              value={destino}
              onChange={setDestino}
              placeholder="Elegir…"
              opciones={[
                ...prods.map((p) => ({ value: `p:${p.id}`, label: p.detalle, grupo: "Productos de la tienda (POS)" })),
                ...ins.map((i) => ({ value: `i:${i.id}`, label: i.nombre, grupo: "Insumos del lavado" })),
              ]}
            />
            <span className="text-xs text-muted-foreground">Si no está, créalo primero en Inventario (Productos o Insumos).</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-ml">Formato (ml por unidad)</Label>
              <Input id="p-ml" inputMode="decimal" value={ml} onChange={(e) => setMl(e.target.value)} placeholder="120, 500, 1000, 20000" />
            </div>
            <div className="grid gap-1.5">
              <Label>Maquila neta por unidad</Label>
              <PriceInput value={maquila} onChange={setMaquila} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Envases y otros por unidad (frasco, atomizador, etiqueta…)</Label>
            <FilasComponentes filas={filas} setFilas={setFilas} materias={materias} sufijo={unidad} agregar="+ Envase" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={activa} onCheckedChange={(c) => setActiva(c === true)} />
            Activa
          </label>
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
