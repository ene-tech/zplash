"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { AppData, AuditoriaEntrada, UIState } from "@/types";
import { CATEGORIAS_GASTO_DEFAULT, CATEGORIAS_INGRESO_DEFAULT, CONFIG_DEFAULT, PERFILES_DEFAULT, PRECIOS_DEFAULT, SERVICIOS_DEFAULT } from "@/lib/helpers";
import { insertAuditoria, loadAll, waitForStorage } from "@/lib/db";
import {
  commitAlertasMantencion,
  commitBloqueosAgenda,
  commitCartolaMovimientos,
  commitCategoriasGasto,
  commitCategoriasIngreso,
  commitCategoriasInsumo,
  commitCategoriasProducto,
  commitCitas,
  commitClientes,
  commitConfig,
  commitCupones,
  commitDestinosInventario,
  commitEmpresas,
  commitHorariosAgenda,
  commitIngresos,
  commitInsumos,
  commitMaquinarias,
  commitMovimientosContables,
  commitMovimientosInventario,
  commitPerfiles,
  commitPrecios,
  commitProductos,
  commitProveedores,
  commitRegistrosMantencion,
  commitReglasConciliacion,
  commitServicios,
  commitVentas,
  derivarMovimientosDesdeVentas,
  type CommitResult,
} from "@/context/commit";

const initialData: AppData = {
  clientes: [],
  ingresos: [],
  ventas: [],
  precios: JSON.parse(JSON.stringify(PRECIOS_DEFAULT)),
  perfiles: JSON.parse(JSON.stringify(PERFILES_DEFAULT)),
  cupones: [],
  movimientosContables: [],
  categoriasGasto: JSON.parse(JSON.stringify(CATEGORIAS_GASTO_DEFAULT)),
  categoriasIngreso: JSON.parse(JSON.stringify(CATEGORIAS_INGRESO_DEFAULT)),
  categoriasProducto: [],
  empresas: [],
  servicios: JSON.parse(JSON.stringify(SERVICIOS_DEFAULT)),
  horariosAgenda: [],
  bloqueosAgenda: [],
  citas: [],
  config: JSON.parse(JSON.stringify(CONFIG_DEFAULT)),
  cartolaMovimientos: [],
  reglasConciliacion: [],
  proveedores: [],
  productos: [],
  insumos: [],
  categoriasInsumo: [],
  destinosInventario: [],
  movimientosInventario: [],
  maquinarias: [],
  registrosMantencion: [],
  alertasMantencion: [],
};

const initialUI: UIState = {
  view: "login",
  operResult: null,
  adminTab: "clientes",
  contabilidadTab: "egreso",
  webSettingsTab: "precios",
  inventarioTab: "productos",
  mantencionTab: "maquinas",
  search: "",
  modal: null,
  loginErr: "",
  cierreDesde: null,
  cierreHasta: null,
  statsDesde: null,
  statsHasta: null,
  ingresosDesde: null,
  ingresosHasta: null,
  facturaSearch: "",
  loginMode: null,
  perfilSeleccionadoId: null,
  perfilActual: null,
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
  logout: (extra?: Partial<UIState>) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(initialData);
  // commit() necesita leer y escribir el `data` más reciente de forma
  // síncrona: si dos commits se disparan casi juntos (doble clic, o dos
  // acciones encadenadas antes de que termine el primer round-trip),
  // ambos cerraban sobre el `data` de cuando se creó su respectivo handler
  // — el segundo terminaba mezclando su patch sobre una copia vieja y
  // pisaba en pantalla lo que el primero ya había guardado. dataRef se
  // actualiza en el mismo tick que setData(), así que cada commit() lee
  // siempre lo último, venga o no de un re-render todavía no aplicado.
  const dataRef = useRef(data);
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
      dataRef.current = loaded;
      setData(loaded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function commit(patch: Partial<AppData>): Promise<boolean> {
    const previous = dataRef.current;
    patch = derivarMovimientosDesdeVentas(previous, patch);

    const next = { ...previous, ...patch };
    dataRef.current = next;
    setData(next);

    const usuario = ui.perfilActual?.nombre || null;
    const ops: Promise<boolean>[] = [];
    const auditoria: AuditoriaEntrada[] = [];
    const agregar = (r: CommitResult) => {
      ops.push(...r.ops);
      auditoria.push(...r.auditoria);
    };

    agregar(commitClientes(previous.clientes, patch.clientes, usuario));
    agregar(commitIngresos(previous.ingresos, patch.ingresos, usuario));

    // citas se resuelve y espera ANTES de tocar ventas (ver comentario en
    // commitCitas, @/context/commit/agenda): ventas.citaId tiene FK a
    // citas.id y ambas suelen llegar juntas en el mismo commit.
    const { ok: citasOk, auditoria: auditoriaCitas } = await commitCitas(previous.citas, patch.citas, usuario);
    auditoria.push(...auditoriaCitas);

    agregar(commitVentas(previous.ventas, patch.ventas, usuario));
    agregar(commitPerfiles(previous.perfiles, patch.perfiles));
    agregar(commitCupones(previous.cupones, patch.cupones, usuario));
    agregar(commitMovimientosContables(previous.movimientosContables, patch.movimientosContables, usuario));
    agregar(commitCategoriasGasto(previous.categoriasGasto, patch.categoriasGasto));
    agregar(commitCategoriasIngreso(previous.categoriasIngreso, patch.categoriasIngreso));
    agregar(commitCategoriasProducto(previous.categoriasProducto, patch.categoriasProducto));
    agregar(commitCategoriasInsumo(previous.categoriasInsumo, patch.categoriasInsumo));
    agregar(commitCartolaMovimientos(previous.cartolaMovimientos, patch.cartolaMovimientos));
    agregar(commitReglasConciliacion(previous.reglasConciliacion, patch.reglasConciliacion));
    agregar(commitEmpresas(previous.empresas, patch.empresas, usuario));
    agregar(commitPrecios(patch.precios));
    agregar(commitServicios(previous.servicios, patch.servicios));
    agregar(commitHorariosAgenda(previous.horariosAgenda, patch.horariosAgenda));
    agregar(commitBloqueosAgenda(previous.bloqueosAgenda, patch.bloqueosAgenda));
    agregar(commitConfig(patch.config));
    agregar(commitProveedores(previous.proveedores, patch.proveedores));
    agregar(commitProductos(previous.productos, patch.productos));
    agregar(commitInsumos(previous.insumos, patch.insumos));
    agregar(commitDestinosInventario(previous.destinosInventario, patch.destinosInventario));
    agregar(commitMovimientosInventario(previous.movimientosInventario, patch.movimientosInventario));
    agregar(commitMaquinarias(previous.maquinarias, patch.maquinarias));
    agregar(commitRegistrosMantencion(previous.registrosMantencion, patch.registrosMantencion));
    agregar(commitAlertasMantencion(previous.alertasMantencion, patch.alertasMantencion));

    let results: boolean[];
    try {
      results = await Promise.all(ops);
    } catch (err) {
      // Igual que citasOk: si el fetch de la Server Action nunca llega al
      // servidor (offline), la promesa rechaza en vez de resolver `false`.
      // Sin este catch, el rechazo se propagaba sin manejar hasta el
      // `onClick` que llamó a commit(), saltándose el rollback de abajo y el
      // mensaje de error en pantalla — el operador veía el cambio aplicado
      // localmente aunque nunca se guardó.
      console.error("No se pudo guardar: posible falla de red", err);
      results = [false];
    }
    const ok = citasOk && results.every(Boolean);
    setStorageReady(ok);
    if (!ok) {
      console.error("No se pudo guardar toda la información en el almacenamiento persistente");
      // Revertimos el estado local: si no se guardó en Supabase, la app no debe
      // seguir mostrando el cambio como aplicado (otras sesiones nunca lo verán).
      dataRef.current = previous;
      setData(previous);
    } else if (auditoria.length) {
      // Best-effort: un fallo acá no revierte la escritura de negocio, que
      // ya se confirmó guardada (ver insertAuditoria en @/lib/db).
      insertAuditoria(auditoria);
    }
    return ok;
  }

  function patchUi(patch: Partial<UIState>) {
    setUi((prev) => ({ ...prev, ...patch }));
  }

  // Limpia la cookie de sesión en el servidor además de resetear el estado
  // local — sin esto, el login seguía "activo" del lado del servidor (ver
  // @/lib/session) aunque la UI ya mostrara la pantalla de login.
  async function logout(extra: Partial<UIState> = {}) {
    patchUi({ view: "login", perfilActual: null, perfilSeleccionadoId: null, ...extra });
    try {
      await fetch("/api/perfiles/logout", { method: "POST" });
    } catch {
      // Best-effort: si falla, la cookie expira sola a las 12h (ver crearSesion).
    }
  }

  return (
    <AppContext.Provider value={{ data, commit, ui, patchUi, storageReady, storageChecked, loading, logout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
