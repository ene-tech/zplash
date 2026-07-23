"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { generarFolioTraspaso, productoPermitidoEnDestino, puedeBorrarCategoriaInventario, stockPorDestino, uid } from "@/lib/helpers";
import type { MovimientoInventario } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Trash2 } from "lucide-react";

interface GuiaDesdeBodega {
  folio: string;
  fecha: string;
  destinoId: string;
  notas?: string;
  creadoPor?: string;
  ids: string[];
  lineas: { productoId: string; cantidad: number }[];
}

export default function GuiaTraspasoTab() {
  const { data, ui, patchUi, commit } = useApp();
  const destinosActivos = data.destinosInventario.filter((d) => d.activo);
  const bodega = data.destinosInventario.find((d) => d.esBodega);

  const [origenId, setOrigenId] = useState(bodega?.id || destinosActivos[0]?.id || "");
  const [destinoId, setDestinoId] = useState("");
  const [notas, setNotas] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const puedeBorrar = puedeBorrarCategoriaInventario(ui.perfilActual?.nombre);

  const destinoNombre = (id: string) => data.destinosInventario.find((d) => d.id === id)?.nombre || "-";
  const productoNombre = (id: string) => {
    const p = data.productos.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.detalle}` : "(producto eliminado)";
  };

  // Agrupa los movimientos que salieron de Bodega por folio: cada guía se
  // crea con un folio compartido entre todas sus líneas (un producto por
  // línea, ver guardar() más abajo), así que agrupar por folio reconstruye
  // la guía completa aunque se haya guardado como varias filas.
  const guiasDesdeBodega = useMemo<GuiaDesdeBodega[]>(() => {
    if (!bodega) return [];
    const porFolio = new Map<string, GuiaDesdeBodega>();
    for (const m of data.movimientosInventario) {
      if (m.origenId !== bodega.id) continue;
      const existente = porFolio.get(m.folio);
      if (existente) {
        existente.ids.push(m.id);
        existente.lineas.push({ productoId: m.productoId, cantidad: m.cantidad });
      } else {
        porFolio.set(m.folio, {
          folio: m.folio,
          fecha: m.fecha,
          destinoId: m.destinoId,
          notas: m.notas,
          creadoPor: m.creadoPor,
          ids: [m.id],
          lineas: [{ productoId: m.productoId, cantidad: m.cantidad }],
        });
      }
    }
    return [...porFolio.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [data.movimientosInventario, bodega]);

  const eliminarGuia = (guia: GuiaDesdeBodega) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar la guía N° ${guia.folio} (${guia.lineas.length} producto(s) hacia "${destinoNombre(guia.destinoId)}")? Esta acción no se puede deshacer.`,
        confirmLabel: "Eliminar",
        onConfirm: () => {
          commit({ movimientosInventario: data.movimientosInventario.filter((m) => !guia.ids.includes(m.id)) });
        },
      },
    });
  };

  const disponibleEnOrigen = (productoId: string, origen: string = origenId) => {
    const producto = data.productos.find((p) => p.id === productoId);
    if (!producto) return 0;
    const stock = stockPorDestino(producto, data.destinosInventario, data.movimientosInventario);
    return stock.get(origen) ?? 0;
  };

  const destino = data.destinosInventario.find((d) => d.id === destinoId);

  const permitidoEnDestino = (productoId: string) => {
    if (!destino) return true;
    const producto = data.productos.find((p) => p.id === productoId);
    return !producto || productoPermitidoEnDestino(producto, destino);
  };

  // La lista solo muestra productos con stock en el origen elegido y, si ya
  // se eligió destino, que además tengan ese destino permitido en su ficha
  // (ver destinosBloqueados en @/types) — así se saca automáticamente lo que
  // no se puede traspasar en vez de solo deshabilitarlo.
  const q = (ui.search || "").trim().toLowerCase();
  const productos = useMemo(() => {
    return data.productos
      .filter((p) => p.activo && (!q || p.sku.toLowerCase().includes(q) || p.detalle.toLowerCase().includes(q)))
      .filter((p) => (stockPorDestino(p, data.destinosInventario, data.movimientosInventario).get(origenId) ?? 0) > 0)
      .filter((p) => !destino || productoPermitidoEnDestino(p, destino))
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }, [data.productos, data.destinosInventario, data.movimientosInventario, q, origenId, destino]);

  const setCantidad = (productoId: string, valor: number) => {
    setCantidades((prev) => ({ ...prev, [productoId]: valor }));
  };

  const cambiarOrigen = (nuevoOrigenId: string) => {
    setOrigenId(nuevoOrigenId);
    setCantidades((prev) => {
      const siguiente = { ...prev };
      for (const [productoId, cantidad] of Object.entries(siguiente)) {
        if (cantidad > disponibleEnOrigen(productoId, nuevoOrigenId)) delete siguiente[productoId];
      }
      return siguiente;
    });
  };

  const cambiarDestino = (nuevoDestinoId: string) => {
    setDestinoId(nuevoDestinoId);
    const nuevoDestino = data.destinosInventario.find((d) => d.id === nuevoDestinoId);
    setCantidades((prev) => {
      const siguiente = { ...prev };
      for (const productoId of Object.keys(siguiente)) {
        const producto = data.productos.find((p) => p.id === productoId);
        if (producto && nuevoDestino && !productoPermitidoEnDestino(producto, nuevoDestino)) delete siguiente[productoId];
      }
      return siguiente;
    });
  };

  const lineas = Object.entries(cantidades).filter(([, c]) => c > 0);
  const totalUnidades = lineas.reduce((sum, [, c]) => sum + c, 0);

  const limpiar = () => {
    setCantidades({});
    setNotas("");
  };

  const guardar = async () => {
    if (!origenId || !destinoId) {
      setErr({ msg: "Selecciona origen y destino", ok: false });
      return;
    }
    if (origenId === destinoId) {
      setErr({ msg: "El origen y el destino no pueden ser el mismo", ok: false });
      return;
    }
    if (lineas.length === 0) {
      setErr({ msg: "Ingresa la cantidad de al menos un producto", ok: false });
      return;
    }
    for (const [productoId, cantidad] of lineas) {
      const p = data.productos.find((x) => x.id === productoId);
      if (!permitidoEnDestino(productoId)) {
        setErr({ msg: `"${p?.sku}" no puede estar en "${data.destinosInventario.find((d) => d.id === destinoId)?.nombre}"`, ok: false });
        return;
      }
      const disponible = disponibleEnOrigen(productoId);
      if (cantidad > disponible) {
        setErr({ msg: `No hay suficiente stock de "${p?.sku}" en el origen (disponible: ${disponible})`, ok: false });
        return;
      }
    }

    const fecha = new Date().toISOString();
    const folio = generarFolioTraspaso(data.movimientosInventario.map((m) => m.folio));
    const nuevos: MovimientoInventario[] = lineas.map(([productoId, cantidad]) => ({
      id: uid(),
      folio,
      productoId,
      origenId,
      destinoId,
      cantidad,
      fecha,
      notas: notas.trim() || undefined,
      creadoPor: ui.perfilActual?.nombre || "Administrador",
    }));

    const ok = await commit({ movimientosInventario: [...data.movimientosInventario, ...nuevos] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar la guía (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: `Guía N° ${folio} guardada: ${lineas.length} producto(s), ${totalUnidades} unidad(es).`, ok: true });
    limpiar();
  };

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Selecciona un origen y un destino: la lista solo muestra los productos con stock en el origen y que tienen
        ese destino permitido en su ficha. Luego ingresa la cantidad a traspasar de cada producto — al guardar se
        registra un traspaso por cada producto con cantidad ingresada, como una sola guía.
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>Origen</label>
          <select value={origenId} onChange={(e) => cambiarOrigen(e.target.value)}>
            {destinosActivos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>Destino</label>
          <select value={destinoId} onChange={(e) => cambiarDestino(e.target.value)}>
            <option value="" disabled>
              Selecciona un destino
            </option>
            {destinosActivos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>Notas (opcional)</label>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: guía N° 123" />
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por SKU o detalle..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
      </div>

      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="max-w-[180px]">Detalle</TableHead>
              <TableHead>Disponible en origen</TableHead>
              <TableHead>Cantidad a traspasar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="empty">No hay productos disponibles para traspasar entre este origen y destino</div>
                </TableCell>
              </TableRow>
            ) : (
              productos.map((p) => {
                const disponible = disponibleEnOrigen(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.sku}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={p.detalle}>{p.detalle}</TableCell>
                    <TableCell>{disponible}</TableCell>
                    <TableCell>
                      <input
                        type="number"
                        min={0}
                        max={disponible}
                        placeholder="0"
                        value={cantidades[p.id] || ""}
                        onChange={(e) => setCantidad(p.id, Number(e.target.value) || 0)}
                        style={{ width: 90 }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ color: "var(--gray)", fontSize: 13 }}>
          {lineas.length} producto(s) seleccionado(s), {totalUnidades} unidad(es) en total
        </div>
        <button className="btn ghost" onClick={limpiar}>
          Limpiar
        </button>
        <button className="btn" onClick={guardar}>
          Guardar guía de traspaso
        </button>
      </div>
      <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
        {err?.msg || ""}
      </div>

      <h3 style={{ marginTop: 28 }}>Guías de traslado desde Bodega</h3>
      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {guiasDesdeBodega.length === 0 ? (
          <div className="empty">Todavía no hay guías de traslado registradas desde Bodega</div>
        ) : (
          guiasDesdeBodega.map((guia) => (
            <div key={guia.folio} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">Folio {guia.folio}</div>
                <div className="truncate text-xs text-muted-foreground">
                  → {destinoNombre(guia.destinoId)} · {new Date(guia.fecha).toLocaleDateString("es-CL")}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {guia.lineas.map((l) => `${productoNombre(l.productoId)} ×${l.cantidad}`).join(" · ")}
                </div>
              </div>
              {puedeBorrar && (
                <MobileRowMenu actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminarGuia(guia) }]} />
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
              <TableHead>Destino</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Registrado por</TableHead>
              {puedeBorrar && <TableHead className="sticky right-0 z-10 w-0 bg-background" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {guiasDesdeBodega.length === 0 ? (
              <TableRow>
                <TableCell colSpan={puedeBorrar ? 7 : 6}>
                  <div className="empty">Todavía no hay guías de traslado registradas desde Bodega</div>
                </TableCell>
              </TableRow>
            ) : (
              guiasDesdeBodega.map((guia) => (
                <TableRow key={guia.folio}>
                  <TableCell>{guia.folio}</TableCell>
                  <TableCell>{new Date(guia.fecha).toLocaleString("es-CL")}</TableCell>
                  <TableCell>{destinoNombre(guia.destinoId)}</TableCell>
                  <TableCell>
                    {guia.lineas.map((l, i) => (
                      <div key={i}>
                        {productoNombre(l.productoId)} × {l.cantidad}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell>{guia.notas || "-"}</TableCell>
                  <TableCell>{guia.creadoPor || "-"}</TableCell>
                  {puedeBorrar && (
                    <TableCell className="sticky right-0 z-10 bg-background">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminarGuia(guia)}
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
