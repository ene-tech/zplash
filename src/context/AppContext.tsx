"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { AppData, CategoriaGasto, Cliente, Cupon, MovimientoContable, Operador, UIState } from "@/types";
import { ADMINISTRADORES_DEFAULT, CATEGORIAS_GASTO_DEFAULT, OPERADORES_DEFAULT, PRECIOS_DEFAULT } from "@/lib/helpers";
import {
  deleteClientes,
  deleteCupones,
  deleteMovimientosContables,
  deleteOperadores,
  insertIngresos,
  insertVentas,
  loadAll,
  setPinAdmin,
  upsertCategoriasGasto,
  upsertClientes,
  upsertCupones,
  upsertMovimientosContables,
  upsertOperadores,
  upsertPrecios,
  waitForStorage,
} from "@/lib/db";

const initialData: AppData = {
  clientes: [],
  ingresos: [],
  ventas: [],
  pinAdmin: "1234",
  precios: JSON.parse(JSON.stringify(PRECIOS_DEFAULT)),
  operadores: JSON.parse(JSON.stringify(OPERADORES_DEFAULT)),
  administradores: JSON.parse(JSON.stringify(ADMINISTRADORES_DEFAULT)),
  cupones: [],
  movimientosContables: [],
  categoriasGasto: JSON.parse(JSON.stringify(CATEGORIAS_GASTO_DEFAULT)),
};

const initialUI: UIState = {
  view: "login",
  operResult: null,
  adminTab: "clientes",
  contabilidadTab: "egreso",
  search: "",
  modal: null,
  loginErr: "",
  cierreDesde: null,
  cierreHasta: null,
  facturaSearch: "",
  loginMode: null,
  operadorSeleccionado: null,
  operadorActual: null,
  adminSeleccionado: null,
  adminActual: null,
  clientesFiltroEstado: "todos",
  clientesOrden: "estado",
};

interface AppContextValue {
  data: AppData;
  commit: (patch: Partial<AppData>) => Promise<boolean>;
  ui: UIState;
  patchUi: (patch: Partial<UIState>) => void;
  storageReady: boolean;
  storageChecked: boolean;
  loading: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

// Compara contra el objeto/id previo por referencia: cada acción de la app
// construye objetos NUEVOS solo para las filas que cambiaron y reutiliza la
// misma referencia para las filas que no tocó, así que esto detecta con
// precisión qué filas hay que insertar/actualizar/eliminar en Supabase, sin
// tener que reescribir la tabla completa en cada guardado.
function diffPorId<T extends { id: string }>(previos: T[], siguientes: T[]) {
  const prevById = new Map(previos.map((x) => [x.id, x]));
  const nextIds = new Set(siguientes.map((x) => x.id));
  const cambiados = siguientes.filter((x) => prevById.get(x.id) !== x);
  const eliminados = previos.filter((x) => !nextIds.has(x.id)).map((x) => x.id);
  return { cambiados, eliminados };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(initialData);
  const [ui, setUi] = useState<UIState>(initialUI);
  const [storageReady, setStorageReady] = useState(false);
  const [storageChecked, setStorageChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ready = await waitForStorage();
      if (cancelled) return;
      setStorageReady(ready);
      setStorageChecked(true);
      if (!ready) {
        await new Promise((r) => setTimeout(r, 1500));
      }
      const loaded = await loadAll();
      if (cancelled) return;
      setData(loaded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function commit(patch: Partial<AppData>): Promise<boolean> {
    const previous = data;
    const next = { ...data, ...patch };
    setData(next);

    const ops: Promise<boolean>[] = [];

    if (patch.clientes) {
      const { cambiados, eliminados } = diffPorId<Cliente>(previous.clientes, patch.clientes);
      if (cambiados.length) ops.push(upsertClientes(cambiados));
      if (eliminados.length) ops.push(deleteClientes(eliminados));
    }
    if (patch.ingresos) {
      const prevIds = new Set(previous.ingresos.map((i) => i.id));
      const nuevos = patch.ingresos.filter((i) => !prevIds.has(i.id));
      if (nuevos.length) ops.push(insertIngresos(nuevos));
    }
    if (patch.ventas) {
      const prevIds = new Set(previous.ventas.map((v) => v.id));
      const nuevas = patch.ventas.filter((v) => !prevIds.has(v.id));
      if (nuevas.length) ops.push(insertVentas(nuevas));
    }
    if (patch.operadores) {
      const { cambiados, eliminados } = diffPorId<Operador>(previous.operadores, patch.operadores);
      if (cambiados.length) ops.push(upsertOperadores(cambiados));
      if (eliminados.length) ops.push(deleteOperadores(eliminados));
    }
    // administradores no se escribe desde acá: la tabla ya no acepta escrituras
    // del cliente (ver /api/admin/cambiar-clave, que usa la service role key).
    if (patch.cupones) {
      const { cambiados, eliminados } = diffPorId<Cupon>(previous.cupones, patch.cupones);
      if (cambiados.length) ops.push(upsertCupones(cambiados));
      if (eliminados.length) ops.push(deleteCupones(eliminados));
    }
    if (patch.movimientosContables) {
      const { cambiados, eliminados } = diffPorId<MovimientoContable>(previous.movimientosContables, patch.movimientosContables);
      if (cambiados.length) ops.push(upsertMovimientosContables(cambiados));
      if (eliminados.length) ops.push(deleteMovimientosContables(eliminados));
    }
    if (patch.categoriasGasto) {
      const { cambiados } = diffPorId<CategoriaGasto>(previous.categoriasGasto, patch.categoriasGasto);
      if (cambiados.length) ops.push(upsertCategoriasGasto(cambiados));
    }
    if (patch.precios) {
      ops.push(upsertPrecios(patch.precios));
    }
    if (patch.pinAdmin !== undefined) {
      ops.push(setPinAdmin(patch.pinAdmin));
    }

    const results = await Promise.all(ops);
    const ok = results.every(Boolean);
    setStorageReady(ok);
    if (!ok) {
      console.error("No se pudo guardar toda la información en el almacenamiento persistente");
      // Revertimos el estado local: si no se guardó en Supabase, la app no debe
      // seguir mostrando el cambio como aplicado (otras sesiones nunca lo verán).
      setData(previous);
    }
    return ok;
  }

  function patchUi(patch: Partial<UIState>) {
    setUi((prev) => ({ ...prev, ...patch }));
  }

  return (
    <AppContext.Provider value={{ data, commit, ui, patchUi, storageReady, storageChecked, loading }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
