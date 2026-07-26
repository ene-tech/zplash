"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { generarFolioTraspaso, productoPermitidoEnDestino, puedeBorrarCategoriaInventario, stockPorDestino, uid } from "@/lib/helpers";
import type { MovimientoInventario } from "@/types";

export interface GuiaDesdeBodega {
  folio: string;
  fecha: string;
  destinoId: string;
  notas?: string;
  creadoPor?: string;
  ids: string[];
  lineas: { productoId: string; cantidad: number }[];
}

// Lógica de la Guía de Traspaso entre destinos de inventario: elección de
// origen/destino, cantidades a traspasar por producto (filtrado por stock
// disponible y por destinos permitidos en la ficha del producto), guardado
// como un movimiento por línea bajo un folio compartido, y el listado de
// guías ya emitidas desde Bodega (agrupadas por ese mismo folio).
export function useGuiaTraspaso() {
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

  return {
    ui,
    patchUi,
    destinosActivos,
    origenId,
    destinoId,
    notas,
    setNotas,
    cantidades,
    err,
    puedeBorrar,
    destinoNombre,
    productoNombre,
    guiasDesdeBodega,
    eliminarGuia,
    disponibleEnOrigen,
    productos,
    setCantidad,
    cambiarOrigen,
    cambiarDestino,
    lineas,
    totalUnidades,
    limpiar,
    guardar,
  };
}
