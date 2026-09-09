"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import PriceInput from "@/components/PriceInput";
import { fmtCLP, generarCodigoProducto, margenProducto, uid } from "@/lib/helpers";
import type { Producto } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

const SIN_CATEGORIA = "sin-categoria";
const SIN_PROVEEDOR = "sin-proveedor";

export default function ProductoModal({ data: prod }: { data: Producto | null }) {
  const { data, commit, patchUi, ui } = useApp();
  const pr = prod || ({} as Partial<Producto>);

  const skuRef = useRef<HTMLInputElement>(null);
  const detalleRef = useRef<HTMLInputElement>(null);
  const stockRef = useRef<HTMLInputElement>(null);
  const stockMinRef = useRef<HTMLInputElement>(null);
  const stockMaxRef = useRef<HTMLInputElement>(null);
  const empaqueMinimoRef = useRef<HTMLInputElement>(null);
  const [categoria, setCategoria] = useState(pr.categoriaId || SIN_CATEGORIA);
  const [proveedor, setProveedor] = useState(pr.proveedorId || SIN_PROVEEDOR);
  const [valorCompra, setValorCompra] = useState(pr.valorCompra ? String(pr.valorCompra) : "");
  const [valorVenta, setValorVenta] = useState(pr.valorVenta ? String(pr.valorVenta) : "");
  const [activo, setActivo] = useState(pr.activo ?? true);
  // Bodega nunca puede quedar bloqueada (es el origen implícito de todo
  // Producto.stock — bloquearla dejaría el stock sin ningún destino válido).
  // Se filtra también al cargar por si el producto ya trae datos viejos con
  // Bodega bloqueada por error.
  const idsBodega = new Set(data.destinosInventario.filter((d) => d.esBodega).map((d) => d.id));
  const [destinosBloqueados, setDestinosBloqueados] = useState<string[]>(
    (pr.destinosBloqueados || []).filter((id) => !idsBodega.has(id))
  );
  const [err, setErr] = useState("");
  // El código se asigna una sola vez (al abrir el modal para un producto
  // nuevo) y no se vuelve a recalcular en re-renders, para que no cambie
  // bajo el usuario mientras completa el resto del formulario.
  const [codigo] = useState(() => pr.codigo || generarCodigoProducto(data.productos.map((p) => p.codigo)));

  const cerrar = () => patchUi({ modal: null });

  const proveedoresOrdenados = [...data.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const categoriasOrdenadas = [...data.categoriasProducto]
    .filter((c) => c.activa || c.id === pr.categoriaId)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const destinosOrdenados = [...data.destinosInventario]
    .filter((d) => d.activo)
    .sort((a, b) => (b.esBodega ? 1 : 0) - (a.esBodega ? 1 : 0) || a.nombre.localeCompare(b.nombre));

  const toggleDestinoBloqueado = (destinoId: string) => {
    setDestinosBloqueados((prev) => (prev.includes(destinoId) ? prev.filter((id) => id !== destinoId) : [...prev, destinoId]));
  };

  const guardar = async () => {
    const sku = skuRef.current?.value.trim() || "";
    const detalle = detalleRef.current?.value.trim() || "";
    if (!sku || !detalle) {
      setErr("SKU y Detalle son obligatorios");
      return;
    }
    const dup = data.productos.find((x) => x.sku.toLowerCase() === sku.toLowerCase() && x.id !== prod?.id);
    if (dup) {
      setErr("Ya existe un producto con ese SKU");
      return;
    }
    const stockMin = Number(stockMinRef.current?.value) || 0;
    const stockMax = Number(stockMaxRef.current?.value) || 0;
    if (stockMax > 0 && stockMax < stockMin) {
      setErr("El Stock Máximo no puede ser menor que el Stock Mínimo");
      return;
    }
    const empaqueMinimo = Number(empaqueMinimoRef.current?.value) || 1;

    const campos = {
      codigo,
      sku,
      detalle,
      categoriaId: categoria === SIN_CATEGORIA ? "" : categoria,
      valorCompra: Number(valorCompra) || 0,
      valorVenta: Number(valorVenta) || 0,
      stock: Number(stockRef.current?.value) || 0,
      stockMin,
      stockMax,
      empaqueMinimo,
      proveedorId: proveedor === SIN_PROVEEDOR ? "" : proveedor,
      activo,
      destinosBloqueados,
    };

    let productos: Producto[];
    if (prod) {
      const actualizado: Producto = { ...(prod as Producto), ...campos };
      productos = data.productos.map((x) => (x.id === prod.id ? actualizado : x));
    } else {
      const nuevo: Producto = {
        id: uid(),
        ...campos,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "Administrador",
      };
      productos = [...data.productos, nuevo];
    }

    const ok = await commit({ productos });
    if (!ok) {
      setErr("No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.");
      return;
    }
    cerrar();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prod ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Código</Label>
            <Input value={codigo} disabled />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prod-sku">SKU</Label>
            <Input id="prod-sku" ref={skuRef} defaultValue={pr.sku || ""} autoFocus={!prod} placeholder="Nombre de fantasía (web/vending)" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prod-detalle">Detalle</Label>
            <Input id="prod-detalle" ref={detalleRef} defaultValue={pr.detalle || ""} />
          </div>
          <div className="grid gap-1.5">
            <Label>Categoría</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v ?? SIN_CATEGORIA)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CATEGORIA}>Sin categoría</SelectItem>
                {categoriasOrdenadas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Valor de Compra</Label>
            <PriceInput value={valorCompra} onChange={setValorCompra} />
          </div>
          <div className="grid gap-1.5">
            <Label>Valor de Venta</Label>
            <PriceInput value={valorVenta} onChange={setValorVenta} />
            {(() => {
              const margen = margenProducto({ valorCompra: Number(valorCompra) || 0, valorVenta: Number(valorVenta) || 0 });
              return margen ? (
                <p className="text-xs text-muted-foreground">
                  Margen: {fmtCLP(margen.unitario)} ({margen.pct.toFixed(1)}%) — venta neta (sin IVA) menos costo de compra
                </p>
              ) : null;
            })()}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prod-stock">Stock actual</Label>
            <Input id="prod-stock" ref={stockRef} type="number" min={0} defaultValue={pr.stock ?? 0} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prod-stock-min">Stock Mínimo</Label>
            <Input id="prod-stock-min" ref={stockMinRef} type="number" min={0} defaultValue={pr.stockMin ?? 0} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prod-stock-max">Stock Máximo</Label>
            <Input id="prod-stock-max" ref={stockMaxRef} type="number" min={0} placeholder="0 = sin tope" defaultValue={pr.stockMax ?? 0} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prod-empaque">Mínimo de empaque (cantidad por caja)</Label>
            <Input id="prod-empaque" ref={empaqueMinimoRef} type="number" min={1} defaultValue={pr.empaqueMinimo ?? 1} />
          </div>
          <div className="grid gap-1.5">
            <Label>Proveedor</Label>
            <Select value={proveedor} onValueChange={(v) => setProveedor(v ?? SIN_PROVEEDOR)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_PROVEEDOR}>Sin proveedor asignado</SelectItem>
                {proveedoresOrdenados.map((prv) => (
                  <SelectItem key={prv.id} value={prv.id}>
                    {prv.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Ubicaciones bloqueadas</Label>
            <p className="text-xs text-muted-foreground">
              Marca las bodegas/máquinas donde este producto NO puede estar (ej. un paño no debería cargarse en
              &ldquo;Vending Café&rdquo;). Los traspasos hacia esas ubicaciones quedarán bloqueados.
            </p>
            {destinosOrdenados.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay destinos de inventario configurados.</p>
            ) : (
              destinosOrdenados.map((d) => (
                <label key={d.id} className={`flex items-center gap-2 text-sm ${d.esBodega ? "opacity-50" : ""}`}>
                  <Checkbox
                    checked={!d.esBodega && destinosBloqueados.includes(d.id)}
                    disabled={d.esBodega}
                    onCheckedChange={() => toggleDestinoBloqueado(d.id)}
                  />
                  {d.nombre}
                  {d.esBodega && <span className="text-xs text-muted-foreground">(no se puede bloquear: origen del stock)</span>}
                </label>
              ))
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={activo} onCheckedChange={(checked) => setActivo(checked === true)} />
            Activo
          </label>

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
