"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP } from "@/lib/helpers";
import type { Producto } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Pencil, Trash2, ArrowLeftRight } from "lucide-react";

export default function ProductosTab() {
  const { data, ui, patchUi, commit } = useApp();
  const proveedorNombre = (id?: string) => data.proveedores.find((p) => p.id === id)?.nombre || "-";
  const categoriaNombre = (id?: string) => data.categoriasProducto.find((c) => c.id === id)?.nombre || "-";

  const q = (ui.search || "").trim().toLowerCase();
  const filtrados = useMemo(() => {
    return data.productos
      .filter(
        (p) =>
          !q ||
          p.codigo.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.detalle.toLowerCase().includes(q) ||
          categoriaNombre(p.categoriaId).toLowerCase().includes(q)
      )
      .sort((a, b) => a.sku.localeCompare(b.sku));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- categoriaNombre is a plain closure over data.categoriasProducto, already listed below
  }, [data.productos, data.categoriasProducto, q]);

  const bajoMinimo = data.productos.filter((p) => p.activo && p.stock < p.stockMin).length;

  const eliminar = (p: Producto) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar el producto ${p.sku} — ${p.detalle}? Esta acción no se puede deshacer.`,
        onConfirm: () => {
          commit({ productos: data.productos.filter((x) => x.id !== p.id) });
        },
      },
    });
  };

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="num">{data.productos.length}</div>
          <div className="lbl">Productos</div>
        </div>
        <div className={`stat-card ${bajoMinimo > 0 ? "warn" : ""}`}>
          <div className="num">{bajoMinimo}</div>
          <div className="lbl">Bajo Stock Mínimo</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por código, SKU, detalle o categoría..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <button className="btn" onClick={() => patchUi({ modal: { type: "producto", data: null } })}>
          + Nuevo producto
        </button>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {filtrados.length === 0 ? (
          <div className="empty">No hay productos que coincidan</div>
        ) : (
          filtrados.map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{p.sku}</span>
                  {!p.activo && <span className="shrink-0 text-xs text-muted-foreground">Inactivo</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{p.detalle}</div>
                <div className={`truncate text-xs ${p.stock < p.stockMin ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                  Stock {p.stock} (mín {p.stockMin}) · {fmtCLP(p.valorVenta)}
                </div>
              </div>
              <MobileRowMenu
                actions={[
                  { label: "Editar", icon: <Pencil />, onClick: () => patchUi({ modal: { type: "producto", data: p } }) },
                  {
                    label: "Traspasar",
                    icon: <ArrowLeftRight />,
                    onClick: () => patchUi({ modal: { type: "traspasoInventario", productoId: p.id } }),
                  },
                  { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(p) },
                ]}
              />
            </div>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="max-w-[180px]">Detalle</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Valor Compra</TableHead>
              <TableHead>Valor Venta</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Stock Mín</TableHead>
              <TableHead>Stock Máx</TableHead>
              <TableHead>Empaque</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13}>
                  <div className="empty">No hay productos que coincidan</div>
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.codigo}</TableCell>
                  <TableCell>{p.sku}</TableCell>
                  <TableCell className="max-w-[180px] truncate" title={p.detalle}>{p.detalle}</TableCell>
                  <TableCell>{categoriaNombre(p.categoriaId)}</TableCell>
                  <TableCell>{fmtCLP(p.valorCompra)}</TableCell>
                  <TableCell>{fmtCLP(p.valorVenta)}</TableCell>
                  <TableCell style={p.stock < p.stockMin ? { color: "var(--red)", fontWeight: 600 } : undefined}>{p.stock}</TableCell>
                  <TableCell>{p.stockMin}</TableCell>
                  <TableCell>{p.stockMax || "-"}</TableCell>
                  <TableCell>{p.empaqueMinimo}</TableCell>
                  <TableCell>{proveedorNombre(p.proveedorId)}</TableCell>
                  <TableCell>{p.activo ? "Activo" : "Inactivo"}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => patchUi({ modal: { type: "producto", data: p } })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Traspasar"
                        aria-label="Traspasar"
                        onClick={() => patchUi({ modal: { type: "traspasoInventario", productoId: p.id } })}
                      >
                        <ArrowLeftRight />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminar(p)}
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
    </div>
  );
}
