"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { CATEGORIA_DETAILING, precioServicio } from "@/lib/helpers";

export type Linea = { id: string; nombre: string; precio: number };
export type ItemPersonalizado = { id: string; nombre: string; precio: number };

// Estado y acciones del catálogo de servicios elegido para el registro:
// selección múltiple normal, salvo "Lavado Completo Detailing" que es
// single-select (radio) dentro de su categoría; más los ítems personalizados
// (monto libre con su propio detalle de texto).
export function useServicioSeleccion(detallePersonalizadoRef: RefObject<HTMLInputElement | null>, setErr: (msg: string) => void) {
  const { data } = useApp();
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<string[]>([]);
  const [itemsPersonalizados, setItemsPersonalizados] = useState<ItemPersonalizado[]>([]);
  const [ajuste, setAjuste] = useState<0 | 5000 | 10000>(0);
  const [montoPersonalizadoTexto, setMontoPersonalizadoTexto] = useState("");

  const catalogo = data.servicios.filter((s) => s.activo);
  const categorias = Array.from(new Set(catalogo.map((s) => s.categoria || "")));

  const hayDetailingSeleccionado = serviciosSeleccionados.some(
    (id) => catalogo.find((s) => s.id === id)?.categoria === CATEGORIA_DETAILING
  );

  const primerDetailingIdx = serviciosSeleccionados.findIndex(
    (id) => catalogo.find((s) => s.id === id)?.categoria === CATEGORIA_DETAILING
  );
  const lineasCatalogo: Linea[] = serviciosSeleccionados.map((id, idx) => {
    const s = catalogo.find((x) => x.id === id)!;
    const precio = precioServicio(data.precios, s.id) + (idx === primerDetailingIdx && ajuste > 0 ? ajuste : 0);
    return { id: s.id, nombre: s.nombre, precio };
  });
  const lineasPersonalizadas: Linea[] = itemsPersonalizados.map((i) => ({ id: i.id, nombre: i.nombre, precio: i.precio }));
  const lineas: Linea[] = [...lineasCatalogo, ...lineasPersonalizadas];
  const totalListado = lineas.reduce((s, l) => s + l.precio, 0);

  // Dentro de "Lavado Completo Detailing" solo se puede tener 1 tamaño
  // seleccionado a la vez (radio): elegir otro reemplaza al anterior. Las
  // demás categorías (Adicionales) siguen siendo multi-selección normal.
  const toggleServicio = (id: string, categoria: string) => {
    setServiciosSeleccionados((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (categoria === CATEGORIA_DETAILING) {
        return [...prev.filter((x) => catalogo.find((s) => s.id === x)?.categoria !== CATEGORIA_DETAILING), id];
      }
      return [...prev, id];
    });
    setErr("");
  };

  const agregarPersonalizado = () => {
    const nombre = detallePersonalizadoRef.current?.value.trim() || "";
    const monto = Number(montoPersonalizadoTexto || "0");
    if (!nombre || !monto || monto <= 0) {
      setErr("Ingresa un detalle y un monto válido para el servicio personalizado");
      return;
    }
    setErr("");
    setItemsPersonalizados((prev) => [...prev, { id: "custom-" + Date.now(), nombre, precio: monto }]);
    if (detallePersonalizadoRef.current) detallePersonalizadoRef.current.value = "";
    setMontoPersonalizadoTexto("");
  };

  const quitarPersonalizado = (id: string) => {
    setItemsPersonalizados((prev) => prev.filter((i) => i.id !== id));
  };

  const resetSeleccion = () => {
    setServiciosSeleccionados([]);
    setItemsPersonalizados([]);
    setAjuste(0);
  };

  return {
    catalogo,
    categorias,
    serviciosSeleccionados,
    itemsPersonalizados,
    ajuste,
    setAjuste,
    montoPersonalizadoTexto,
    setMontoPersonalizadoTexto,
    hayDetailingSeleccionado,
    lineas,
    totalListado,
    toggleServicio,
    agregarPersonalizado,
    quitarPersonalizado,
    resetSeleccion,
  };
}
