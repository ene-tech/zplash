"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP } from "@/lib/helpers";
import type { Insumo } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Pencil, Trash2, Boxes } from "lucide-react";

export default function InsumosTab() {
  const { data, ui, patchUi, commit } = useApp();
  const proveedorNombre = (id?: string) => data.proveedores.find((p) => p.id === id)?.nombre || "-";
  const categoriaNombre = (id?: string) => data.categoriasInsumo.find((c) => c.id === id)?.nombre || "-";

  const q = (ui.search || "").trim().toLowerCase();
  const filtrados = useMemo(() => {
    return data.insumos
      .filter(
        (i) =>
          !q ||
          i.nombre.toLowerCase().includes(q) ||
          categoriaNombre(i.categoriaId).toLowerCase().includes(q) ||
          proveedorNombre(i.proveedorId).toLowerCase().includes(q)
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- categoriaNombre/proveedorNombre son closures sobre data.categoriasInsumo/data.proveedores, ya listados abajo
  }, [data.insumos, data.categoriasInsumo, data.proveedores, q]);

  const bajoMinimo = data.insumos.filter((i) => i.activo && i.stock < i.stockMin).length;

  const eliminar = (i: Insumo) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar el insumo ${i.nombre}? Esta acción no se puede deshacer.`,
        onConfirm: () => {
          commit({ insumos: data.insumos.filter((x) => x.id !== i.id) });
        },
      },
    });
  };

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="num">{data.insumos.length}</div>
          <div className="lbl">Insumos</div>
        </div>
        <div className={`stat-card ${bajoMinimo > 0 ? "warn" : ""}`}>
          <div className="num">{bajoMinimo}</div>
          <div className="lbl">Bajo Stock Mínimo</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por nombre, categoría o proveedor..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <button className="btn" onClick={() => patchUi({ modal: { type: "insumo", data: null } })}>
          + Nuevo insumo
        </button>
      </div>

      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {filtrados.length === 0 ? (
          <div className="empty">No hay insumos que coincidan</div>
        ) : (
          filtrados.map((i) => (
            <MobileRecordCard
              key={i.id}
              avatar={<MobileRecordAvatar icon={Boxes} tone={i.stock < i.stockMin ? "bad" : "neutral"} />}
              title={
                <>
                  {i.nombre} {!i.activo && <span className="font-normal text-muted-foreground">(Inactivo)</span>}
                </>
              }
              subtitle={`${categoriaNombre(i.categoriaId)} · ${proveedorNombre(i.proveedorId)}`}
              menu={
                <MobileRowMenu
                  actions={[
                    { label: "Editar", icon: <Pencil />, onClick: () => patchUi({ modal: { type: "insumo", data: i } }) },
                    { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(i) },
                  ]}
                />
              }
              meta={
                <MobileRecordMeta
                  left={
                    <span className={i.stock < i.stockMin ? "font-semibold text-destructive" : undefined}>
                      Stock {i.stock} (mín {i.stockMin})
                    </span>
                  }
                  right={fmtCLP(i.valorCompra)}
                />
              }
            />
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="max-w-[160px]">Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Valor Compra</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Stock Mín</TableHead>
              <TableHead>Stock Máx</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="empty">No hay insumos que coincidan</div>
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="max-w-[160px] truncate" title={i.nombre}>{i.nombre}</TableCell>
                  <TableCell>{categoriaNombre(i.categoriaId)}</TableCell>
                  <TableCell>{fmtCLP(i.valorCompra)}</TableCell>
                  <TableCell style={i.stock < i.stockMin ? { color: "var(--red)", fontWeight: 600 } : undefined}>{i.stock}</TableCell>
                  <TableCell>{i.stockMin}</TableCell>
                  <TableCell>{i.stockMax || "-"}</TableCell>
                  <TableCell>{proveedorNombre(i.proveedorId)}</TableCell>
                  <TableCell>{i.activo ? "Activo" : "Inactivo"}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => patchUi({ modal: { type: "insumo", data: i } })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminar(i)}
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
