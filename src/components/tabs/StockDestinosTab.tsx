"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { puedeBorrarCategoriaInventario, stockPorDestino } from "@/lib/helpers";
import type { MovimientoInventario } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Trash2 } from "lucide-react";

export default function StockDestinosTab() {
  const { data, ui, patchUi, commit } = useApp();
  const puedeBorrar = puedeBorrarCategoriaInventario(ui.perfilActual?.nombre);
  const destinoNombre = (id: string) => data.destinosInventario.find((d) => d.id === id)?.nombre || "-";

  const destinosActivos = useMemo(
    () => data.destinosInventario.filter((d) => d.activo).sort((a, b) => (b.esBodega ? 1 : 0) - (a.esBodega ? 1 : 0) || a.nombre.localeCompare(b.nombre)),
    [data.destinosInventario]
  );

  const q = (ui.search || "").trim().toLowerCase();
  const productosFiltrados = useMemo(() => {
    return data.productos
      .filter((p) => p.activo && (!q || p.sku.toLowerCase().includes(q) || p.detalle.toLowerCase().includes(q)))
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }, [data.productos, q]);

  const historial = useMemo(() => data.movimientosInventario.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 50), [data.movimientosInventario]);

  const productoNombre = (id: string) => {
    const p = data.productos.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.detalle}` : "(producto eliminado)";
  };

  const eliminarTraspaso = (m: MovimientoInventario) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar el traspaso de ${m.cantidad} unidad(es) de "${productoNombre(m.productoId)}" (${destinoNombre(m.origenId)} → ${destinoNombre(m.destinoId)})? Esta acción no se puede deshacer.`,
        confirmLabel: "Eliminar",
        onConfirm: () => {
          commit({ movimientosInventario: data.movimientosInventario.filter((x) => x.id !== m.id) });
        },
      },
    });
  };

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Buscar por SKU o detalle..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <button className="btn" onClick={() => patchUi({ modal: { type: "traspasoInventario" } })}>
          + Nuevo traspaso
        </button>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {productosFiltrados.length === 0 ? (
          <div className="empty">No hay productos que coincidan</div>
        ) : (
          productosFiltrados.map((p) => {
            const porDestino = stockPorDestino(p, data.destinosInventario, data.movimientosInventario);
            return (
              <div key={p.id} className="p-3">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{p.sku}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">Total: {p.stock}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{p.detalle}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {destinosActivos.map((d) => `${d.nombre}: ${porDestino.get(d.id) ?? 0}`).join(" · ")}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="max-w-[180px]">Detalle</TableHead>
              <TableHead>Stock total</TableHead>
              {destinosActivos.map((d) => (
                <TableHead key={d.id}>{d.nombre}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {productosFiltrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3 + destinosActivos.length}>
                  <div className="empty">No hay productos que coincidan</div>
                </TableCell>
              </TableRow>
            ) : (
              productosFiltrados.map((p) => {
                const porDestino = stockPorDestino(p, data.destinosInventario, data.movimientosInventario);
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.sku}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={p.detalle}>{p.detalle}</TableCell>
                    <TableCell>{p.stock}</TableCell>
                    {destinosActivos.map((d) => (
                      <TableCell key={d.id}>{porDestino.get(d.id) ?? 0}</TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <h3 style={{ marginTop: 28 }}>Historial de traspasos</h3>
      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {historial.length === 0 ? (
          <div className="empty">Todavía no hay traspasos registrados</div>
        ) : (
          historial.map((m) => (
            <div key={m.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">Folio {m.folio}</div>
                <div className="truncate text-xs text-muted-foreground">{productoNombre(m.productoId)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {destinoNombre(m.origenId)} → {destinoNombre(m.destinoId)} · {m.cantidad} un. ·{" "}
                  {new Date(m.fecha).toLocaleDateString("es-CL")}
                </div>
              </div>
              {puedeBorrar && (
                <MobileRowMenu
                  actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminarTraspaso(m) }]}
                />
              )}
            </div>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="max-w-[180px]">Producto</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Registrado por</TableHead>
              {puedeBorrar && <TableHead className="sticky right-0 z-10 w-0 bg-background" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {historial.length === 0 ? (
              <TableRow>
                <TableCell colSpan={puedeBorrar ? 9 : 8}>
                  <div className="empty">Todavía no hay traspasos registrados</div>
                </TableCell>
              </TableRow>
            ) : (
              historial.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.folio}</TableCell>
                  <TableCell>{new Date(m.fecha).toLocaleString("es-CL")}</TableCell>
                  <TableCell className="max-w-[180px] truncate" title={productoNombre(m.productoId)}>{productoNombre(m.productoId)}</TableCell>
                  <TableCell>{destinoNombre(m.origenId)}</TableCell>
                  <TableCell>{destinoNombre(m.destinoId)}</TableCell>
                  <TableCell>{m.cantidad}</TableCell>
                  <TableCell>{m.notas || "-"}</TableCell>
                  <TableCell>{m.creadoPor || "-"}</TableCell>
                  {puedeBorrar && (
                    <TableCell className="sticky right-0 z-10 bg-background">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminarTraspaso(m)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
