"use client";

import { useState } from "react";
import { toast } from "sonner";
import PriceInput from "@/components/PriceInput";
import { useAppUi } from "@/context/AppContext";
import { fmtCLP, fmtFecha } from "@/lib/helpers";
import { eliminarMateriaPrima, guardarMateriaPrima, moverStockMateriaPrima } from "@/lib/serverActions";
import type { MateriaPrima, TipoMateriaPrima } from "@/types";
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ArrowDownUp, History, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import SelectFab from "./SelectFab";
import { aTexto, esNumero, fmtCantidad, fmtFormatoCompra, parseDecimal, unidadFormato, type FabricacionTabProps } from "./shared";
import { costoCompraConFlete, fletePorUnidad, redondearCantidad } from "@/lib/logic";

const NUEVA: MateriaPrima = { id: "", nombre: "", tipo: "materia_prima", unidad: "L", stock: 0, stockMin: 0, activa: true };

const TIPOS: { value: TipoMateriaPrima; label: string; plural: string }[] = [
  { value: "materia_prima", label: "Materia prima", plural: "Materias primas" },
  { value: "insumo", label: "Insumo", plural: "Insumos" },
  { value: "mano_obra", label: "Mano de obra", plural: "Mano de obra" },
];
const etiquetaTipo = (t: TipoMateriaPrima) => TIPOS.find((x) => x.value === t)?.label ?? t;
const INPUT_PRECIO = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export default function MateriasPrimasTab({ datos, recargar }: FabricacionTabProps) {
  const { patchUi } = useAppUi();
  const [editando, setEditando] = useState<MateriaPrima | null>(null);
  const [moviendo, setMoviendo] = useState<{ mp: MateriaPrima; tipo: "compra" | "ajuste" } | null>(null);
  const [historial, setHistorial] = useState<MateriaPrima | null>(null);
  const [q, setQ] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoMateriaPrima | "todos">("todos");

  const lista = datos.materiasPrimas
    .filter((m) => filtroTipo === "todos" || m.tipo === filtroTipo)
    .filter((m) => !q || m.nombre.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => TIPOS.findIndex((t) => t.value === a.tipo) - TIPOS.findIndex((t) => t.value === b.tipo) || a.nombre.localeCompare(b.nombre));
  const loteActual = (id: string) => datos.lotes.find((l) => l.materiaPrimaId === id && l.restante > 0);
  const bajoMinimo = datos.materiasPrimas.filter((m) => m.activa && m.stockMin > 0 && m.stock < m.stockMin).length;
  const sinOrigen = datos.materiasPrimas.filter((m) => m.activa && m.tipo !== "mano_obra" && m.stock <= 0 && m.precioFabrica === undefined).length;
  const valorizado = datos.lotes.reduce((s, l) => s + l.restante * l.costoUnitario, 0);
  // Monto que tenemos en cada una (suma de sus lotes a costo FIFO).
  const montoPorMp = new Map<string, number>();
  for (const l of datos.lotes) montoPorMp.set(l.materiaPrimaId, (montoPorMp.get(l.materiaPrimaId) ?? 0) + l.restante * l.costoUnitario);
  const montoLista = lista.reduce((s, m) => s + (montoPorMp.get(m.id) ?? 0), 0);

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
        <input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {([{ value: "todos", plural: "Todos" }, ...TIPOS] as const).map((t) => (
            <button key={t.value} className={`btn ${filtroTipo === t.value ? "" : "ghost"}`} onClick={() => setFiltroTipo(t.value)}>
              {t.plural}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setEditando({ ...NUEVA, tipo: filtroTipo === "todos" ? "materia_prima" : filtroTipo, unidad: filtroTipo === "mano_obra" ? "hr" : filtroTipo === "insumo" ? "un" : "L" })}>
          + Nuevo
        </button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Al producir se usa primero lo nuestro (del lote más antiguo). Lo que falte lo pone la fábrica a su precio; si la fábrica no la pone, la
        recepción se bloquea. La mano de obra no tiene stock: nunca falta y suma su costo por unidad.
      </p>

      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Formato compra</TableHead>
              <TableHead>Nuestro stock</TableHead>
              <TableHead className="text-center">Monto en stock</TableHead>
              <TableHead>Costo actual (FIFO)</TableHead>
              <TableHead>Precio fábrica</TableHead>
              <TableHead>Mínimo</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="empty">No hay nada que coincida</div>
                </TableCell>
              </TableRow>
            ) : (
              lista.map((m) => {
                const lote = loteActual(m.id);
                const manoObra = m.tipo === "mano_obra";
                return (
                  <TableRow key={m.id} className={m.activa ? undefined : "opacity-50"}>
                    <TableCell>
                      <div>{m.nombre}</div>
                      <div className="text-xs text-muted-foreground">{etiquetaTipo(m.tipo)}</div>
                    </TableCell>
                    <TableCell>{m.formatoCompra ? fmtFormatoCompra(m.formatoCompra, m.unidad) : <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell style={m.stockMin > 0 && m.stock < m.stockMin ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                      {manoObra ? <span className="text-muted-foreground">Sin stock (inagotable)</span> : `${fmtCantidad(m.stock)} ${m.unidad}`}
                    </TableCell>
                    <TableCell className="text-center">{manoObra ? <span className="text-muted-foreground">-</span> : fmtCLP(Math.round(montoPorMp.get(m.id) ?? 0))}</TableCell>
                    <TableCell>
                      {manoObra
                        ? m.costoManoObra !== undefined
                          ? `${fmtCLP(m.costoManoObra)} / ${m.unidad}`
                          : "-"
                        : lote
                          ? `${fmtCLP(lote.costoUnitario)} / ${m.unidad}`
                          : "-"}
                    </TableCell>
                    <TableCell>
                      {manoObra ? (
                        <span className="text-muted-foreground">-</span>
                      ) : m.precioFabrica !== undefined ? (
                        `${fmtCLP(m.precioFabrica)} / ${m.unidad}`
                      ) : (
                        <span className="text-muted-foreground">No la pone</span>
                      )}
                    </TableCell>
                    <TableCell>{!manoObra && m.stockMin ? `${fmtCantidad(m.stockMin)} ${m.unidad}` : "-"}</TableCell>
                    <TableCell className="sticky right-0 z-10 bg-background">
                      <div className="flex items-center gap-1">
                        {!manoObra && (
                          <>
                            <Button variant="ghost" size="icon-sm" title="Registrar compra" aria-label="Registrar compra" onClick={() => setMoviendo({ mp: m, tipo: "compra" })}>
                              <ShoppingCart />
                            </Button>
                            <Button variant="ghost" size="icon-sm" title="Ajuste por conteo" aria-label="Ajuste por conteo" onClick={() => setMoviendo({ mp: m, tipo: "ajuste" })}>
                              <ArrowDownUp />
                            </Button>
                            <Button variant="ghost" size="icon-sm" title="Lotes e historial" aria-label="Lotes e historial" onClick={() => setHistorial(m)}>
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
                );
              })
            )}
          </TableBody>
          {lista.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">
                  Total {filtroTipo === "todos" ? "" : TIPOS.find((t) => t.value === filtroTipo)?.plural.toLowerCase()}
                  {q ? " (filtrado)" : ""}
                </TableCell>
                <TableCell className="text-center font-semibold">{fmtCLP(Math.round(montoLista))}</TableCell>
                <TableCell colSpan={4} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {editando && (
        <MateriaPrimaDialog
          mp={editando}
          lotes={datos.lotes.filter((l) => l.materiaPrimaId === editando.id && l.restante > 0)}
          onClose={() => setEditando(null)}
          recargar={recargar}
        />
      )}
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

const MEDIDAS = [
  { value: "L", label: "Líquido (litros)" },
  { value: "kg", label: "Sólido (kilos)" },
  { value: "un", label: "Unidades (frascos, etiquetas, sprayers…)" },
];
const MEDIDAS_MANO_OBRA = [
  { value: "hr", label: "Horas" },
  { value: "un", label: "Por unidad producida" },
];

function MateriaPrimaDialog({
  mp,
  lotes,
  onClose,
  recargar,
}: {
  mp: MateriaPrima;
  /** Lotes con saldo de esta materia prima. */
  lotes: FabricacionTabProps["datos"]["lotes"];
  onClose: () => void;
  recargar: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    nombre: mp.nombre,
    tipo: mp.tipo,
    costoManoObra: mp.costoManoObra !== undefined ? String(mp.costoManoObra) : "",
    unidad: mp.unidad,
    // El formato se escribe en ml / g / un (ver unidadFormato), o en litros si
    // se elige, y se guarda en L / kg / un.
    formatoEnL: mp.unidad === "L" && (mp.formatoCompra ?? 1) >= 1,
    formato: mp.formatoCompra
      ? aTexto(redondearCantidad(mp.formatoCompra * (mp.unidad === "L" && mp.formatoCompra >= 1 ? 1 : unidadFormato(mp.unidad).factor)))
      : "",
    precioCompra: mp.precioCompra !== undefined ? String(mp.precioCompra) : "",
    laPone: mp.precioFabrica !== undefined,
    precio: mp.precioFabrica ? String(mp.precioFabrica) : "",
    minimo: mp.stockMin ? aTexto(mp.stockMin) : "",
    stock: aTexto(mp.stock),
    fleteTotal: mp.fleteTotal !== undefined ? String(mp.fleteTotal) : "",
    fleteCantidad: mp.fleteCantidad ? aTexto(mp.fleteCantidad) : "",
    activa: mp.activa,
    revalorizar: true,
  });
  const [guardando, setGuardando] = useState(false);

  const uf = unidadFormato(form.unidad);
  const enL = form.unidad === "L" && form.formatoEnL;
  const sufijoFormato = enL ? "L" : uf.sufijo;
  const factorFormato = enL ? 1 : uf.factor;
  const formatoValido = form.formato.trim() === "" || (esNumero(form.formato) && parseDecimal(form.formato) > 0);
  const formatoCompra = form.formato.trim() && formatoValido ? Math.round((parseDecimal(form.formato) / factorFormato) * 1e6) / 1e6 : undefined;
  const precioCompra = form.precioCompra === "" ? undefined : Number(form.precioCompra) || 0;
  const nombreUnidad = form.unidad === "L" ? "litro" : form.unidad;
  const fleteTotal = form.fleteTotal === "" ? undefined : Number(form.fleteTotal) || 0;
  const fleteCantidadValida = esNumero(form.fleteCantidad) && parseDecimal(form.fleteCantidad) > 0;
  const fleteCantidad = fleteCantidadValida ? parseDecimal(form.fleteCantidad) : undefined;
  const flete = { fleteTotal, fleteCantidad };
  const fleteUnidad = fletePorUnidad(flete);
  const costoConFlete = costoCompraConFlete({ precioCompra, ...flete });
  // Cambiar litros <-> ml convierte lo escrito, para no reinterpretarlo.
  const cambiarEnL = (v: boolean) => {
    if (v === form.formatoEnL) return;
    const formato = formatoCompra ? aTexto(redondearCantidad(v ? formatoCompra : formatoCompra * 1000)) : form.formato;
    setForm({ ...form, formatoEnL: v, formato });
  };
  // El stock solo se ajusta si el usuario tocó el campo: guardar la ficha por
  // otro motivo no debe mover stock.
  const stockTocado = form.stock.trim() !== aTexto(mp.stock);
  const stockValido = esNumero(form.stock) && parseDecimal(form.stock) >= 0;
  const stockNuevo = parseDecimal(form.stock);
  const sube = stockTocado && stockValido && stockNuevo > mp.stock + 1e-9;
  // Con stock cargado no se cambia la unidad ni se pasa a mano de obra: los lotes quedarían colgando.
  const unidadFija = mp.stock > 0;
  const manoObra = form.tipo === "mano_obra";
  // El stock que entra se costea con el valor de compra de la ficha más el flete prorrateado de la ficha.
  const cantidadEntra = sube ? stockNuevo - mp.stock : 0;
  const costoEntra = costoCompra(cantidadEntra, precioCompra ?? 0, fleteUnidad * cantidadEntra);
  // El monto en stock sale de los lotes; si su costo no es el de la ficha (valor + flete), se ofrece dejarlo a ese costo.
  const montoActual = lotes.reduce((s, l) => s + l.restante * l.costoUnitario, 0);
  const stockLotes = lotes.reduce((s, l) => s + l.restante, 0);
  const ofreceRevalorizar =
    !manoObra && costoConFlete !== undefined && form.unidad === mp.unidad && lotes.some((l) => Math.abs(l.costoUnitario - costoConFlete) > 0.005);
  const revalorizar = ofreceRevalorizar && form.revalorizar ? costoConFlete : undefined;

  const guardar = async () => {
    if (manoObra) {
      if (form.costoManoObra === "") return toast.error("Indica el costo neto de la mano de obra");
      setGuardando(true);
      const r = await guardarMateriaPrima({
        ...mp,
        nombre: form.nombre,
        tipo: "mano_obra",
        costoManoObra: Number(form.costoManoObra) || 0,
        unidad: form.unidad,
        formatoCompra: undefined,
        precioFabrica: undefined,
        stockMin: 0,
        activa: form.activa,
      });
      setGuardando(false);
      if (!r.ok) return toast.error(r.error);
      await recargar();
      return onClose();
    }
    if (!formatoValido) return toast.error("El formato de compra tiene que ser un número mayor a 0 (o déjalo vacío)");
    if (stockTocado && !stockValido) return toast.error("El stock existente tiene que ser un número (0 o más)");
    if (fleteTotal !== undefined && !fleteCantidadValida) return toast.error("Indica la cantidad transportada (mayor a 0) para prorratear el flete");
    if (sube && precioCompra === undefined) return toast.error(`Indica el valor neto de compra por ${nombreUnidad} para costear el stock que agregas`);
    setGuardando(true);
    const r = await guardarMateriaPrima(
      {
        ...mp,
        nombre: form.nombre,
        tipo: form.tipo,
        costoManoObra: undefined,
        unidad: form.unidad,
        formatoCompra,
        precioFabrica: form.laPone ? Number(form.precio) || 0 : undefined,
        precioCompra,
        fleteTotal,
        fleteCantidad: fleteTotal === undefined ? undefined : fleteCantidad,
        stockMin: parseDecimal(form.minimo),
        activa: form.activa,
      },
      stockTocado ? { anterior: mp.stock, existente: stockNuevo, costoUnitario: sube ? costoEntra.unitario : undefined } : undefined,
      revalorizar
    );
    setGuardando(false);
    if (!r.ok) return toast.error(r.error);
    await recargar();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mp.id ? "Editar" : "Nuevo"} · {etiquetaTipo(form.tipo)}
          </DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label htmlFor="mp-nombre">Nombre</Label>
            <Input id="mp-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mp-tipo">Tipo</Label>
            <SelectFab
              id="mp-tipo"
              value={form.tipo}
              onChange={(v) => {
                const tipo = v as TipoMateriaPrima;
                if (tipo === "mano_obra" && unidadFija) return void toast.error("Tiene stock: para pasarla a mano de obra, primero déjalo en 0 con un ajuste");
                // Al entrar o salir de mano de obra cambia el juego de unidades posibles.
                const cambiaUnidades = (tipo === "mano_obra") !== manoObra;
                setForm({ ...form, tipo, unidad: cambiaUnidades ? (tipo === "mano_obra" ? "hr" : "L") : form.unidad, formato: cambiaUnidades ? "" : form.formato });
              }}
              opciones={TIPOS.map((t) => ({ value: t.value, label: t.label }))}
            />
          </div>
          {manoObra ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="mp-unidad">Se cobra por</Label>
                  <SelectFab id="mp-unidad" value={form.unidad} onChange={(v) => setForm({ ...form, unidad: v })} opciones={MEDIDAS_MANO_OBRA} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Costo neto por {form.unidad === "hr" ? "hora" : "unidad"}</Label>
                  <PriceInput value={form.costoManoObra} onChange={(v) => setForm({ ...form, costoManoObra: v })} className={INPUT_PRECIO} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                La mano de obra no tiene stock: nunca falta. Agrégala a una presentación (cantidad por unidad, ej. 0,05 horas) y su costo suma
                al costo del producto.
              </p>
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="mp-unidad">¿Cómo se mide?</Label>
                {unidadFija ? (
                  <div className="text-sm text-muted-foreground">
                    {MEDIDAS.find((m) => m.value === form.unidad)?.label ?? form.unidad} · no se puede cambiar mientras tenga stock
                  </div>
                ) : (
                  <SelectFab
                    id="mp-unidad"
                    value={form.unidad}
                    // El formato está escrito en la unidad anterior (ml, g, un): se limpia para no reinterpretarlo.
                    onChange={(v) => setForm({ ...form, unidad: v, formato: v === form.unidad ? form.formato : "" })}
                    opciones={MEDIDAS}
                  />
                )}
              </div>
              <div className="grid gap-1.5">
                <div className={form.unidad === "L" ? "grid grid-cols-[1fr_7rem] gap-3" : "grid"}>
                  <div className="grid gap-1.5">
                    <Label htmlFor="mp-formato">Presentación de compra ({sufijoFormato} por envase)</Label>
                    <Input
                      id="mp-formato"
                      inputMode="decimal"
                      value={form.formato}
                      onChange={(e) => setForm({ ...form, formato: e.target.value })}
                      placeholder={
                        form.unidad === "un"
                          ? "Ej: 100 (caja de 100)"
                          : form.unidad === "kg"
                            ? "Ej: 25000 (saco de 25 kg)"
                            : enL
                              ? "Ej: 5 (bidón de 5 L)"
                              : "Ej: 5000 (bidón de 5 L)"
                      }
                    />
                  </div>
                  {form.unidad === "L" && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="mp-formato-unidad">Se compra en</Label>
                      <SelectFab
                        id="mp-formato-unidad"
                        value={form.formatoEnL ? "L" : "ml"}
                        onChange={(v) => cambiarEnL(v === "L")}
                        opciones={[
                          { value: "L", label: "Litros" },
                          { value: "ml", label: "ml" },
                        ]}
                      />
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">Opcional. Con presentación, las compras se cargan por envase y el sistema calcula el costo por {form.unidad}.</span>
              </div>

              <div className="grid gap-1.5">
                <Label>Valor neto de compra por {nombreUnidad}</Label>
                <PriceInput value={form.precioCompra} onChange={(v) => setForm({ ...form, precioCompra: v })} className={INPUT_PRECIO} />
                <span className="text-xs text-muted-foreground">
                  {precioCompra !== undefined && formatoCompra
                    ? `= ${fmtCLP(Math.round(precioCompra * formatoCompra))} neto por envase de ${fmtFormatoCompra(formatoCompra, form.unidad)}. `
                    : "Opcional. "}
                  Se precarga al registrar compras.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Costo total del flete (neto)</Label>
                  <PriceInput value={form.fleteTotal} onChange={(v) => setForm({ ...form, fleteTotal: v })} className={INPUT_PRECIO} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mp-flete-cant">Cantidad transportada ({form.unidad})</Label>
                  <Input
                    id="mp-flete-cant"
                    inputMode="decimal"
                    value={form.fleteCantidad}
                    onChange={(e) => setForm({ ...form, fleteCantidad: e.target.value })}
                    placeholder={form.unidad === "L" ? "Ej: 200" : ""}
                  />
                </div>
              </div>
              {costoConFlete !== undefined && (
                <div className="grid gap-0.5 rounded-lg border border-border p-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Valor neto por {nombreUnidad}</span>
                    <span>{fmtCLP(precioCompra!)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Flete prorrateado por {nombreUnidad}</span>
                    <span>{fleteUnidad ? `+${fmtCLP(Math.round(fleteUnidad * 100) / 100)}` : "-"}</span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border pt-1 font-semibold">
                    <span>Costo con flete por {nombreUnidad}</span>
                    <span>{fmtCLP(Math.round(costoConFlete * 100) / 100)}</span>
                  </div>
                  {formatoCompra && (
                    <div className="flex justify-between gap-3 text-muted-foreground">
                      <span>Por envase de {fmtFormatoCompra(formatoCompra, form.unidad)}</span>
                      <span>{fmtCLP(Math.round(costoConFlete * formatoCompra))}</span>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">Es el costo que usan las fórmulas cuando no hay lote, y el del stock que agregues aquí.</span>
                </div>
              )}
              {ofreceRevalorizar && (
                <label className="flex items-start gap-2 rounded-lg border border-border p-2 text-sm">
                  <Checkbox className="mt-0.5" checked={form.revalorizar} onCheckedChange={(c) => setForm({ ...form, revalorizar: c === true })} />
                  <span>
                    Dejar el stock actual ({fmtCantidad(stockLotes)} {form.unidad}) a {fmtCLP(Math.round(costoConFlete! * 100) / 100)} por {form.unidad}
                    <span className="block text-xs text-muted-foreground">
                      Monto en stock: {fmtCLP(Math.round(montoActual))} → {fmtCLP(Math.round(stockLotes * costoConFlete!))}. No cambia recepciones ya registradas.
                    </span>
                  </span>
                </label>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="mp-stock">Stock existente ({form.unidad})</Label>
                <Input id="mp-stock" inputMode="decimal" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                {formatoCompra && stockNuevo > 0 && (
                  <span className="text-xs text-muted-foreground">= {fmtCantidad(Math.round((stockNuevo / formatoCompra) * 100) / 100)} envases</span>
                )}
              </div>
              {sube &&
                (precioCompra === undefined ? (
                  <p className="text-xs text-destructive">Para costear el stock que agregas, indica arriba el valor neto de compra por {nombreUnidad}.</p>
                ) : (
                  <ResumenCostoCompra
                    cantidad={stockNuevo - mp.stock}
                    unidad={form.unidad}
                    formatoCompra={formatoCompra}
                    precio={precioCompra}
                    costo={costoEntra}
                  />
                ))}
              {mp.id && stockTocado && stockValido && stockNuevo !== mp.stock && (
                <p className="text-xs text-muted-foreground">
                  {sube
                    ? `Entran ${fmtCantidad(stockNuevo - mp.stock)} ${form.unidad} como un lote nuevo con este costo.`
                    : `Salen ${fmtCantidad(mp.stock - stockNuevo)} ${form.unidad} de los lotes más antiguos (FIFO).`}{" "}
                  Queda en el historial como ajuste.
                </p>
              )}

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
            </>
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
  // Con formato, la compra se escribe en envases y su costo es por envase.
  const porEnvase = tipo === "compra" && !!mp.formatoCompra;
  // El valor por unidad arranca en el de la ficha; el costo por envase sale
  // de multiplicarlo por la presentación, y el flete se prorratea en lo comprado.
  const [valor, setValor] = useState(mp.precioCompra !== undefined ? String(mp.precioCompra) : "");
  const [flete, setFlete] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cantidadEnUnidad = porEnvase ? parseDecimal(cantidad) * mp.formatoCompra! : parseDecimal(cantidad);
  // Flete vacío = el prorrateo de la ficha por lo que se compra.
  const fleteFicha = fletePorUnidad(mp);
  const costo = costoCompra(cantidadEnUnidad, Number(valor) || 0, flete === "" ? fleteFicha * cantidadEnUnidad : Number(flete) || 0);
  const costoUnitario = valor === "" ? undefined : costo.unitario;

  const guardar = async () => {
    setGuardando(true);
    const r = await moverStockMateriaPrima({
      materiaPrimaId: mp.id,
      tipo,
      cantidad: cantidadEnUnidad,
      costoUnitario: tipo === "compra" ? costoUnitario : undefined,
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
          {mp.formatoCompra ? ` · formato ${fmtFormatoCompra(mp.formatoCompra, mp.unidad)}` : ""}
        </p>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mov-cant">{porEnvase ? `Envases de ${fmtFormatoCompra(mp.formatoCompra!, mp.unidad)}` : `Cantidad (${mp.unidad})`}</Label>
            <Input
              id="mov-cant"
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder={tipo === "ajuste" ? "Ej: -2,5 si contaste menos" : porEnvase ? "Ej: 3" : "Ej: 25"}
              autoFocus
            />
          </div>
          {tipo === "compra" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Valor neto por {mp.unidad === "L" ? "litro" : mp.unidad}</Label>
                <PriceInput value={valor} onChange={setValor} className={INPUT_PRECIO} />
              </div>
              <div className="grid gap-1.5">
                <Label>Flete / transporte neto</Label>
                <PriceInput value={flete} onChange={setFlete} className={INPUT_PRECIO} />
                {flete === "" && fleteFicha > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Vacío = flete de la ficha ({fmtCLP(Math.round(fleteFicha * 100) / 100)} por {mp.unidad})
                  </span>
                )}
              </div>
            </div>
          )}
          {tipo === "compra" && valor !== "" && cantidadEnUnidad > 0 && (
            <ResumenCostoCompra cantidad={cantidadEnUnidad} unidad={mp.unidad} formatoCompra={mp.formatoCompra} precio={Number(valor) || 0} costo={costo} />
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

/** Costo de una compra: valor neto por unidad × cantidad, más el flete
 * prorrateado. `unitario` es el costo final por unidad (va al lote). */
function costoCompra(cantidad: number, precio: number, flete: number) {
  const subtotal = precio * cantidad;
  const total = subtotal + flete;
  return { subtotal, flete, total, unitario: cantidad > 0 ? total / cantidad : precio };
}

function ResumenCostoCompra({
  cantidad,
  unidad,
  formatoCompra,
  precio,
  costo,
}: {
  cantidad: number;
  unidad: string;
  formatoCompra?: number;
  precio: number;
  costo: ReturnType<typeof costoCompra>;
}) {
  const fila = (etiqueta: string, valor: string, fuerte = false) => (
    <div className={`flex justify-between gap-3 ${fuerte ? "border-t border-border pt-1 font-semibold" : ""}`}>
      <span className={fuerte ? "" : "text-muted-foreground"}>{etiqueta}</span>
      <span>{valor}</span>
    </div>
  );
  const centavos = (n: number) => fmtCLP(Math.round(n * 100) / 100);
  return (
    <div className="grid gap-0.5 rounded-lg border border-border p-2 text-sm">
      {formatoCompra
        ? fila(`Costo neto por envase (${fmtFormatoCompra(formatoCompra, unidad)})`, fmtCLP(Math.round(precio * formatoCompra)))
        : null}
      {fila(`${fmtCantidad(cantidad)} ${unidad} × ${fmtCLP(precio)}`, fmtCLP(Math.round(costo.subtotal)))}
      {costo.flete > 0 && fila(`Flete (+${centavos(costo.flete / cantidad)} por ${unidad})`, fmtCLP(Math.round(costo.flete)))}
      {fila("Costo total neto", fmtCLP(Math.round(costo.total)), true)}
      <div className="text-xs text-muted-foreground">
        Queda a {centavos(costo.unitario)} por {unidad} con flete incluido.
      </div>
    </div>
  );
}
