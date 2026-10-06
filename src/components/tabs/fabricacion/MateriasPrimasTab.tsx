"use client";

import { useState } from "react";
import { toast } from "sonner";
import PriceInput from "@/components/PriceInput";
import { useAppUi } from "@/context/AppContext";
import { fmtCLP, fmtFecha } from "@/lib/helpers";
import { eliminarMateriaPrima, guardarMateriaPrima, moverStockMateriaPrima } from "@/lib/serverActions";
import type { MateriaPrima } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ArrowDownUp, History, Pencil, Trash2 } from "lucide-react";
import { fmtCantidad, parseDecimal, SELECT_CLASS, type FabricacionTabProps } from "./shared";

const NUEVA: MateriaPrima = { id: "", nombre: "", unidad: "kg", propia: true, costoUnitario: 0, stock: 0, stockMin: 0, activa: true };

export default function MateriasPrimasTab({ datos, recargar }: FabricacionTabProps) {
  const [editando, setEditando] = useState<MateriaPrima | null>(null);
  const [moviendo, setMoviendo] = useState<MateriaPrima | null>(null);
  const [historial, setHistorial] = useState<MateriaPrima | null>(null);
  const [q, setQ] = useState("");
  const { patchUi } = useAppUi();

  const lista = datos.materiasPrimas.filter((m) => !q || m.nombre.toLowerCase().includes(q.trim().toLowerCase()));
  const bajoMinimo = datos.materiasPrimas.filter((m) => m.activa && m.propia && m.stock < m.stockMin).length;

  const eliminar = (m: MateriaPrima) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar ${m.nombre}? Se borra también su historial de movimientos. Si solo ya no se usa, mejor desactívala.`,
        danger: true,
        onConfirm: async () => {
          const r = await eliminarMateriaPrima(m.id);
          if (!r.ok) return void toast.error(r.error);
          await recargar();
        },
      },
    });
  };

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="num">{datos.materiasPrimas.filter((m) => m.propia).length}</div>
          <div className="lbl">Propias (en la fábrica)</div>
        </div>
        <div className="stat-card">
          <div className="num">{datos.materiasPrimas.filter((m) => !m.propia).length}</div>
          <div className="lbl">Las pone la fábrica</div>
        </div>
        <div className={`stat-card ${bajoMinimo > 0 ? "warn" : ""}`}>
          <div className="num">{bajoMinimo}</div>
          <div className="lbl">Bajo stock mínimo</div>
        </div>
      </div>

      <div className="toolbar">
        <input placeholder="Buscar materia prima..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setEditando(NUEVA)}>
          + Nueva materia prima
        </button>
      </div>

      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Quién la pone</TableHead>
              <TableHead>Costo / unidad</TableHead>
              <TableHead>Stock en fábrica</TableHead>
              <TableHead>Mínimo</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="empty">Todavía no hay materias primas</div>
                </TableCell>
              </TableRow>
            ) : (
              lista.map((m) => (
                <TableRow key={m.id} className={m.activa ? undefined : "opacity-50"}>
                  <TableCell>{m.nombre}</TableCell>
                  <TableCell>{m.propia ? "Nosotros" : "Fábrica (se cobra)"}</TableCell>
                  <TableCell>
                    {fmtCLP(m.costoUnitario)} / {m.unidad}
                  </TableCell>
                  <TableCell style={m.propia && m.stock < m.stockMin ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                    {m.propia ? `${fmtCantidad(m.stock)} ${m.unidad}` : "-"}
                  </TableCell>
                  <TableCell>{m.propia ? `${fmtCantidad(m.stockMin)} ${m.unidad}` : "-"}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      {m.propia && (
                        <>
                          <Button variant="ghost" size="icon-sm" title="Compra / ajuste" aria-label="Compra o ajuste" onClick={() => setMoviendo(m)}>
                            <ArrowDownUp />
                          </Button>
                          <Button variant="ghost" size="icon-sm" title="Historial" aria-label="Historial" onClick={() => setHistorial(m)}>
                            <History />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon-sm" title="Editar" aria-label="Editar" onClick={() => setEditando(m)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminar(m)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editando && <MateriaPrimaDialog mp={editando} onClose={() => setEditando(null)} recargar={recargar} />}
      {moviendo && <MovimientoDialog mp={moviendo} onClose={() => setMoviendo(null)} recargar={recargar} />}
      {historial && (
        <Dialog open onOpenChange={(o) => !o && setHistorial(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Historial · {historial.nombre}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto text-sm">
              {datos.movimientos.filter((x) => x.materiaPrimaId === historial.id).length === 0 ? (
                <div className="empty">Sin movimientos</div>
              ) : (
                datos.movimientos
                  .filter((x) => x.materiaPrimaId === historial.id)
                  .map((x) => (
                    <div key={x.id} className="flex justify-between gap-3 border-b border-border py-1.5">
                      <div>
                        <div>
                          {fmtFecha(x.fecha)} · {x.tipo === "compra" ? "Compra" : x.tipo === "consumo" ? "Consumo" : "Ajuste"}
                        </div>
                        {x.notas && <div className="text-muted-foreground">{x.notas}</div>}
                      </div>
                      <div className={x.cantidad < 0 ? "text-destructive" : undefined}>
                        {x.cantidad > 0 ? "+" : ""}
                        {fmtCantidad(x.cantidad)} {historial.unidad}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MateriaPrimaDialog({ mp, onClose, recargar }: { mp: MateriaPrima; onClose: () => void; recargar: () => Promise<void> }) {
  const [form, setForm] = useState({ ...mp, costo: mp.costoUnitario ? String(mp.costoUnitario) : "", minimo: mp.stockMin ? String(mp.stockMin) : "" });
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const r = await guardarMateriaPrima({ ...form, costoUnitario: Number(form.costo) || 0, stockMin: parseDecimal(form.minimo) });
    setGuardando(false);
    if (!r.ok) return toast.error(r.error);
    await recargar();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mp.id ? "Editar materia prima" : "Nueva materia prima"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mp-nombre">Nombre</Label>
            <Input id="mp-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mp-propia">¿Quién la pone?</Label>
            <select
              id="mp-propia"
              className={SELECT_CLASS}
              value={form.propia ? "propia" : "fabrica"}
              onChange={(e) => setForm({ ...form, propia: e.target.value === "propia" })}
            >
              <option value="propia">Nosotros (la compramos y queda en la fábrica)</option>
              <option value="fabrica">La fábrica (nos la cobra)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mp-unidad">Unidad</Label>
              <Input id="mp-unidad" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="kg, L" />
            </div>
            <div className="grid gap-1.5">
              <Label>{form.propia ? "Costo de compra" : "Precio que cobra la fábrica"} / unidad</Label>
              <PriceInput value={form.costo} onChange={(v) => setForm({ ...form, costo: v })} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm" />
            </div>
          </div>
          {form.propia && (
            <div className="grid gap-1.5">
              <Label htmlFor="mp-min">Stock mínimo ({form.unidad})</Label>
              <Input id="mp-min" inputMode="decimal" value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.activa} onCheckedChange={(c) => setForm({ ...form, activa: c === true })} />
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

function MovimientoDialog({ mp, onClose, recargar }: { mp: MateriaPrima; onClose: () => void; recargar: () => Promise<void> }) {
  const [tipo, setTipo] = useState<"compra" | "ajuste">("compra");
  const [cantidad, setCantidad] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const r = await moverStockMateriaPrima({ materiaPrimaId: mp.id, tipo, cantidad: parseDecimal(cantidad), notas });
    setGuardando(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Stock actualizado");
    await recargar();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mp.nombre}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Stock actual en la fábrica: {fmtCantidad(mp.stock)} {mp.unidad}
        </p>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mov-tipo">Tipo</Label>
            <select id="mov-tipo" className={SELECT_CLASS} value={tipo} onChange={(e) => setTipo(e.target.value as "compra" | "ajuste")}>
              <option value="compra">Compra (entra a la fábrica)</option>
              <option value="ajuste">Ajuste por conteo (+ o −)</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mov-cant">Cantidad ({mp.unidad})</Label>
            <Input
              id="mov-cant"
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder={tipo === "ajuste" ? "Ej: -2,5" : "Ej: 25"}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mov-notas">Nota</Label>
            <Input id="mov-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="N° factura, motivo del ajuste…" />
          </div>
          {tipo === "compra" && (
            <p className="text-xs text-muted-foreground">La factura de la compra se registra en Contabilidad como siempre: acá solo se suma el stock.</p>
          )}
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
