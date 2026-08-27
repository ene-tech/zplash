"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import type { Modulo, PerfilPublico } from "@/types";

// Estado y lógica de edición de módulos compartidos entre la fila de tabla
// (desktop) y la tarjeta de lista (mobile) — cada una monta su propia
// instancia (son subárboles DOM independientes, uno oculto vía CSS), así que
// no hay problema en que cada una tenga su propio estado local.
export function usePerfilRowState(perfil: PerfilPublico) {
  const { data, commit } = useAppData();
  const [editandoModulos, setEditandoModulos] = useState(false);
  const [reseteando, setReseteando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<Modulo>>(new Set(perfil.modulos));
  const [guardando, setGuardando] = useState(false);

  const toggleModulo = (m: Modulo) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const guardarModulos = async () => {
    setGuardando(true);
    const actualizado: PerfilPublico = { ...perfil, modulos: Array.from(seleccion) };
    await commit({ perfiles: data.perfiles.map((x) => (x.id === perfil.id ? actualizado : x)) });
    setGuardando(false);
    setEditandoModulos(false);
  };

  return { editandoModulos, setEditandoModulos, reseteando, setReseteando, seleccion, toggleModulo, guardarModulos, guardando };
}
