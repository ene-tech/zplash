"use client";

import { useState } from "react";
import type { CartolaMovimiento, MovimientoContable } from "@/types";

export const SIN_VINCULAR = "sin-vincular";
export const ESTADO_TONE = { conciliado: "ok", pendiente: "warn", ignorado: "bad" } as const;
export const ESTADO_LABEL = { conciliado: "Conciliado", pendiente: "Pendiente", ignorado: "Ignorado" } as const;

export interface FilaCartolaProps {
  m: CartolaMovimiento;
  categoriasConocidas: { categoria: string; grupo?: string }[];
  categoriasGastoActivas: { id: string; nombre: string }[];
  categoriasIngresoActivas: { id: string; nombre: string }[];
  vinculables: MovimientoContable[];
  onCambiarEstado: (estado: CartolaMovimiento["estado"]) => void;
  onCambiarCategoria: (categoria: string) => void;
  onGuardarRegla: (patron: string, categoria: string) => void;
  onVincular: (movimientoContableId: string) => void;
  onCrearGasto: (categoria: string, contraparte: string) => Promise<boolean>;
  onCrearIngreso: (categoria: string, contraparte: string) => Promise<boolean>;
}

// Estado y handlers compartidos entre la fila de tabla (desktop) y la
// tarjeta de lista (mobile) — ver mismo criterio en PerfilesTab.
export function useFilaCartolaState(m: CartolaMovimiento, onGuardarRegla: FilaCartolaProps["onGuardarRegla"]) {
  const [categoriaTexto, setCategoriaTexto] = useState(m.categoria || "");
  const [mostrarRegla, setMostrarRegla] = useState(false);
  const [patron, setPatron] = useState(m.glosa.split(" ")[0] || "");
  const [mostrarGasto, setMostrarGasto] = useState(false);
  const [gastoCategoria, setGastoCategoria] = useState("");
  const [gastoContraparte, setGastoContraparte] = useState("");
  const [guardandoGasto, setGuardandoGasto] = useState(false);
  const [mostrarIngreso, setMostrarIngreso] = useState(false);
  const [ingresoCategoria, setIngresoCategoria] = useState("");
  const [ingresoContraparte, setIngresoContraparte] = useState("");
  const [guardandoIngreso, setGuardandoIngreso] = useState(false);

  return {
    categoriaTexto,
    setCategoriaTexto,
    mostrarRegla,
    setMostrarRegla,
    patron,
    setPatron,
    mostrarGasto,
    setMostrarGasto,
    gastoCategoria,
    setGastoCategoria,
    gastoContraparte,
    setGastoContraparte,
    guardandoGasto,
    setGuardandoGasto,
    mostrarIngreso,
    setMostrarIngreso,
    ingresoCategoria,
    setIngresoCategoria,
    ingresoContraparte,
    setIngresoContraparte,
    guardandoIngreso,
    setGuardandoIngreso,
    guardarRegla: () => {
      onGuardarRegla(patron, categoriaTexto);
      setMostrarRegla(false);
    },
  };
}
