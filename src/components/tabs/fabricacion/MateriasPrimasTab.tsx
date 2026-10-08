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
import { ArrowDownUp, History, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import SelectFab from "./SelectFab";
import { fmtCantidad, parseDecimal, type FabricacionTabProps } from "./shared";

const NUEVA: MateriaPrima = { id: "", nombre: "", unidad: "L", stock: 0, stockMin: 0, activa: true };
const INPUT_PRECIO = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export default function MateriasPrimasTab({ datos, recargar }: FabricacionTabProps) {
  const { patchUi } = useAppUi();
  const [editando, setEditando] = useState<MateriaPrima | null>(null);
  const [moviendo, setMoviendo] = useState<{ mp: MateriaPrima; tipo: "compra" | "ajuste" } | null>(null);
  const [historial, setHistorial] = useState<MateriaPrima | null>(null);
  const [q, setQ] = useState("");

  const lista = datos.materiasPrimas.filter((m) => !q || m.nombre.toLowerCase().includes(q.trim().toLowerCase()));
  const loteActual = (id: string) => datos.lotes.find((l) => l.materiaPrimaId === id && l.restante > 0);
  const bajoMinimo = datos.materiasPrimas.filter((m) => m.activa && m.stockMin > 0 && m.stock < m.stockMin).length;
  const sinOrigen = datos.materiasPrimas.filter((m) => m.activa && m.stock <= 0 && m.precioFabrica === undefined).length;
  const valorizado = datos.lotes.reduce((s, l) => s + l.restante * l.costoUnitario, 0);

  const eliminar = (m: MateriaPrima) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar ${m.nombre}? Se borran también sus lotes e historial. Si solo ya no se usa, mejor desactívala.`,
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
          <div className="num">{fmtCLP(Math.round(valorizado))}</div>
          <div className="lbl">Lo nuestro en la fábrica (FIFO)</div>
        </div>
        <div className={`stat-card ${bajoMinimo > 0 ? "warn" : ""}`}>
          <div className="num">{bajoMinimo}</div>
          <div className="lbl">Bajo stock mínimo</div>
        </div>
        <div className={`stat-card ${sinOrigen > 0 ? "warn" : ""}`}>
          <div className="num">{sinOrigen}</div>
          <div className="lbl">Sin stock y la fábrica no la pone</div>
        </div>
      </div>

      <div className="toolbar">
        <input placeholder="Buscar materia prima..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setEditando(NUEVA)}>
          + Nueva materia prima
        </button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Al producir se usa primero lo nuestro (del lote más antiguo). Lo que falte lo pone la fábrica a su precio; si la fábrica no la pone, la
        recepción se bloquea.
      </p>

      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Nuestro stock</TableHead>
              <TableHead>Costo actual (FIFO)</TableHead>
              <TableHead>Precio fábrica</TableHead>
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
              lista.map((m) => {
                const lote = loteActual(m.id);
                return (
                  <TableRow key={m.id} className={m.activa ? undefined : "opacity-50"}>
                    <TableCell>{m.nombre}</TableCell>
                    <TableCell style={m.stockMin > 0 && m.stock < m.stockMin ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                      {fmtCantidad(m.stock)} {m.unidad}
                    </TableCell>
                    <TableCell>{lote ? `${fmtCLP(lote.costoUnitario)} / ${m.unidad}` : "-"}</TableCell>
                    <TableCell>{m.precioFabrica !== undefined ? `${fmtCLP(m.precioFabrica)} / ${m.unidad}` : <span className="text-muted-foreground">No la pone</span>}</TableCell>
                    <TableCell>{m.stockMin ? `${fmtCantidad(m.stockMin)} ${m.unidad}` : "-"}</TableCell>
                    <TableCell className="sticky right-0 z-10 bg-background">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" title="Registrar compra" aria-label="Registrar compra" onClick={() => setMoviendo({ mp: m, tipo: "compra" })}>
                          <ShoppingCart />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Ajuste por conteo" aria-label="Ajuste por conteo" onClick={() => setMoviendo({ mp: m, tipo: "ajuste" })}>
                          <ArrowDownUp />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Lotes e historial" aria-label="Lotes e historial" onClick={() => setHistorial(m)}>
                          <History />
                        </Button>
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {editando && <MateriaPrimaDialog mp={editando} onClose={() => setEditando(null)} recargar={recargar} />}
      {moviendo && <MovimientoDialog mp={moviendo.mp} tipo={moviendo.tipo} onClose={() => setMoviendo(null)} recargar={recargar} />}
      {historial && <HistorialDialog mp={historial} datos={datos} onClose={() => setHistorial(null)} />}
    </div>
  );
}

function HistorialDialog({ mp, datos, onClose }: { mp: MateriaPrima; datos: FabricacionTabProps["datos"]; onClose: () => void }) {
  const lotes = datos.lotes.filter((l) => l.materiaPrimaId === mp.id);
  const movimientos = datos.movimientos.filter((x) => x.materiaPrimaId === mp.id);
  const etiqueta = { compra: "Compra", consumo: "Consumo", ajuste: "Ajuste" } as const;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mp.nombre}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto text-sm">
          <div className="mb-1 font-medium">Lotes con saldo (se usan en este orden)</div>
          {lotes.length === 0 ? (
            <div className="mb-3 text-muted-foreground">Sin saldo</div>
          ) : (
            lotes.map((l) => (
              <div key={l.id} className="flex justify-between border-b border-border py-1">
                <span>
                  {fmtFecha(l.fecha)} {l.notas ? `· ${l.notas}` : ""}
                </span>
                <span>
                  {fmtCantidad(l.restante)} de {fmtCantidad(l.cantidad)} {mp.unidad} a {fmtCLP(l.costoUnitario)}
                </span>
              </div>
            ))
          )}
          <div className="mb-1 mt-4 font-medium">Movimientos</div>
          {movimientos.length === 0 ? (
            <div className="text-muted-foreground">Sin movimientos</div>
          ) : (
            movimientos.map((x) => (
              <div key={x.id} className="flex justify-between gap-3 border-b border-border py-1.5">
                <div>
                  <div>
                    {fmtFecha(x.fecha)} · {etiqueta[x.tipo]}
                    {x.creadoPor ? ` · ${x.creadoPor}` : ""}
                  </div>
                  {x.notas && <div className="text-muted-foreground">{x.notas}</div>}
                </div>
                <div className={`whitespace-nowrap ${x.cantidad < 0 ? "text-destructive" : ""}`}>
                  {x.cantidad > 0 ? "+" : ""}
                  {fmtCantidad(x.cantidad)} {mp.unidad} · {fmtCLP(x.costoUnitario)}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MateriaPrimaDialog({ mp, onClose, recargar }: { mp: MateriaPrima; onClose: () => void; recargar: () => Promise<void> }) {
  const [form, setForm] = useState({
    nombre: mp.nombre,
    unidad: mp.unidad,
    laPone: mp.precioFabrica !== undefined,
    precio: mp.precioFabrica ? String(mp.precioFabrica) : "",
    minimo: mp.stockMin ? String(mp.stockMin).replace(".", ",") : "",
    activa: mp.activa,
  });
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const r = await guardarMateriaPrima({
      ...mp,
      nombre: form.nombre,
      unidad: form.unidad,
      precioFabrica: form.laPone ? Number(form.precio) || 0 : undefined,
      stockMin: parseDecimal(form.minimo),
      activa: form.activa,
    });
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
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mp-nombre">Nombre</Label>
              <Input id="mp-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mp-unidad">Unidad</Label>
              <SelectFab
                id="mp-unidad"
                value={form.unidad}
                onChange={(v) => setForm({ ...form, unidad: v })}
                opciones={["L", "kg", "un"].map((u) => ({ value: u, label: u }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.laPone} onCheckedChange={(c) => setForm({ ...form, laPone: c === true })} />
            La fábrica la puede poner cuando no alcanza lo nuestro
          </label>
          {form.laPone && (
            <div className="grid gap-1.5">
              <Label>Precio neto de la fábrica por {form.unidad}</Label>
              <PriceInput value={form.precio} onChange={(v) => setForm({ ...form, precio: v })} className={INPUT_PRECIO} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="mp-min">Avisar cuando nuestro stock baje de ({form.unidad})</Label>
            <Input id="mp-min" inputMode="decimal" value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} placeholder="0 = sin aviso" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.activa} onCheckedChange={(c) => setForm({ ...form, activa: c === true })} />
            Activa
          </label>
          <p className="text-xs text-muted-foreground">Lo que compramos nosotros se registra con el botón de compra (carrito), con su costo.</p>
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

function MovimientoDialog({
  mp,
  tipo,
  onClose,
  recargar,
}: {
  mp: MateriaPrima;
  tipo: "compra" | "ajuste";
  onClose: () => void;
  recargar: () => Promise<void>;
}) {
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const r = await moverStockMateriaPrima({
      materiaPrimaId: mp.id,
      tipo,
      cantidad: parseDecimal(cantidad),
      costoUnitario: tipo === "compra" ? (costo === "" ? undefined : Number(costo)) : undefined,
      notas,
    });
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
          <DialogTitle>
            {tipo === "compra" ? "Compra" : "Ajuste"} · {mp.nombre}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Nuestro stock en la fábrica: {fmtCantidad(mp.stock)} {mp.unidad}
        </p>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mov-cant">Cantidad ({mp.unidad})</Label>
            <Input
              id="mov-cant"
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder={tipo === "ajuste" ? "Ej: -2,5 si contaste menos" : "Ej: 25"}
              autoFocus
            />
          </div>
          {tipo === "compra" && (
            <div className="grid gap-1.5">
              <Label>Costo neto por {mp.unidad}</Label>
              <PriceInput value={costo} onChange={setCosto} className={INPUT_PRECIO} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="mov-notas">Nota</Label>
            <Input id="mov-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Proveedor, N° factura, motivo del ajuste…" />
          </div>
          <p className="text-xs text-muted-foreground">
            {tipo === "compra"
              ? "Crea un lote nuevo con este costo. La factura de la compra se registra en Contabilidad como siempre."
              : "Un ajuste negativo sale de los lotes más antiguos; uno positivo entra al costo del último lote."}
          </p>
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
