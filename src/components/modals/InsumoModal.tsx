"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import PriceInput from "@/components/PriceInput";
import { uid } from "@/lib/helpers";
import type { Insumo } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

const SIN_CATEGORIA = "sin-categoria";
const SIN_PROVEEDOR = "sin-proveedor";

export default function InsumoModal({ data: ins }: { data: Insumo | null }) {
  const { data, commit, patchUi, ui } = useApp();
  const it = ins || ({} as Partial<Insumo>);

  const nombreRef = useRef<HTMLInputElement>(null);
  const stockRef = useRef<HTMLInputElement>(null);
  const stockMinRef = useRef<HTMLInputElement>(null);
  const stockMaxRef = useRef<HTMLInputElement>(null);
  const [categoria, setCategoria] = useState(it.categoriaId || SIN_CATEGORIA);
  const [proveedor, setProveedor] = useState(it.proveedorId || SIN_PROVEEDOR);
  const [valorCompra, setValorCompra] = useState(it.valorCompra ? String(it.valorCompra) : "");
  const [activo, setActivo] = useState(it.activo ?? true);
  const [err, setErr] = useState("");

  const cerrar = () => patchUi({ modal: null });

  const proveedoresOrdenados = [...data.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const categoriasOrdenadas = [...data.categoriasInsumo]
    .filter((c) => c.activa || c.id === it.categoriaId)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const guardar = async () => {
    const nombre = nombreRef.current?.value.trim() || "";
    if (!nombre) {
      setErr("El nombre es obligatorio");
      return;
    }
    const stockMin = Number(stockMinRef.current?.value) || 0;
    const stockMax = Number(stockMaxRef.current?.value) || 0;
    if (stockMax > 0 && stockMax < stockMin) {
      setErr("El Stock Máximo no puede ser menor que el Stock Mínimo");
      return;
    }

    const campos = {
      nombre,
      categoriaId: categoria === SIN_CATEGORIA ? undefined : categoria,
      valorCompra: Number(valorCompra) || 0,
      stock: Number(stockRef.current?.value) || 0,
      stockMin,
      stockMax,
      proveedorId: proveedor === SIN_PROVEEDOR ? "" : proveedor,
      activo,
    };

    let insumos: Insumo[];
    if (ins) {
      const actualizado: Insumo = { ...(ins as Insumo), ...campos };
      insumos = data.insumos.map((x) => (x.id === ins.id ? actualizado : x));
    } else {
      const nuevo: Insumo = {
        id: uid(),
        ...campos,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "Administrador",
      };
      insumos = [...data.insumos, nuevo];
    }

    const ok = await commit({ insumos });
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
          <DialogTitle>{ins ? "Editar insumo" : "Nuevo insumo"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ins-nombre">Nombre</Label>
            <Input id="ins-nombre" ref={nombreRef} defaultValue={it.nombre || ""} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>Categoría</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v ?? SIN_CATEGORIA)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CATEGORIA}>Sin categoría asignada</SelectItem>
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
            <Label htmlFor="ins-stock">Stock actual</Label>
            <Input id="ins-stock" ref={stockRef} type="number" min={0} step="any" defaultValue={it.stock ?? 0} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ins-stock-min">Stock Mínimo</Label>
            <Input id="ins-stock-min" ref={stockMinRef} type="number" min={0} defaultValue={it.stockMin ?? 0} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ins-stock-max">Stock Máximo</Label>
            <Input id="ins-stock-max" ref={stockMaxRef} type="number" min={0} placeholder="0 = sin tope" defaultValue={it.stockMax ?? 0} />
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
