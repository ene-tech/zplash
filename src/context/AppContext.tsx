"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type {
  AppData,
  AuditoriaEntrada,
  BloqueoAgenda,
  CategoriaGasto,
  Cita,
  Cliente,
  Cupon,
  Empresa,
  HorarioAgenda,
  Ingreso,
  MovimientoContable,
  PerfilPublico,
  Servicio,
  TablaAuditada,
  UIState,
  Venta,
} from "@/types";
import { CATEGORIAS_GASTO_DEFAULT, CONFIG_DEFAULT, PERFILES_DEFAULT, PRECIOS_DEFAULT, SERVICIOS_DEFAULT } from "@/lib/helpers";
import {
  deleteBloqueosAgenda,
  deleteCitas,
  deleteClientes,
  deleteCupones,
  deleteEmpresas,
  deleteHorariosAgenda,
  deleteMovimientosContables,
  deletePerfiles,
  deleteServicios,
  deleteVentas,
  insertAuditoria,
  insertIngresos,
  insertVentas,
  loadAll,
  upsertBloqueosAgenda,
  upsertCategoriasGasto,
  upsertCitas,
  upsertClientes,
  upsertConfig,
  upsertCupones,
  upsertEmpresas,
  upsertHorariosAgenda,
  upsertMovimientosContables,
  upsertPerfiles,
  upsertPrecios,
  upsertServicios,
  upsertVentas,
  waitForStorage,
} from "@/lib/db";

const initialData: AppData = {
  clientes: [],
  ingresos: [],
  ventas: [],
  precios: JSON.parse(JSON.stringify(PRECIOS_DEFAULT)),
  perfiles: JSON.parse(JSON.stringify(PERFILES_DEFAULT)),
  cupones: [],
  movimientosContables: [],
  categoriasGasto: JSON.parse(JSON.stringify(CATEGORIAS_GASTO_DEFAULT)),
  empresas: [],
  servicios: JSON.parse(JSON.stringify(SERVICIOS_DEFAULT)),
  horariosAgenda: [],
  bloqueosAgenda: [],
  citas: [],
  config: JSON.parse(JSON.stringify(CONFIG_DEFAULT)),
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

// Arma las entradas de auditoría para una tabla a partir del mismo diff que
// ya se usa para decidir qué escribir en Supabase (ver diffPorId): una fila
// en `cambiados` es "insert" si no existía antes, "update" si sí; una fila
// en `eliminados` es "delete". No se llama a esto para perfiles/precios/
// categoriasGasto/config: quedan fuera del alcance de la auditoría a
// propósito (bajo riesgo/volumen).
function auditEntries<T extends { id: string }>(
  tabla: TablaAuditada,
  previos: T[],
  cambiados: T[],
  eliminados: string[],
  usuario: string | null
): AuditoriaEntrada[] {
  const prevById = new Map(previos.map((x) => [x.id, x]));
  const entradas: AuditoriaEntrada[] = cambiados.map((row) => {
    const anterior = prevById.get(row.id);
    return {
      tabla,
      registroId: row.id,
      accion: anterior ? "update" : "insert",
      datosAnteriores: anterior ?? null,
      datosNuevos: row,
      usuario,
    };
  });
  for (const id of eliminados) {
    entradas.push({
      tabla,
      registroId: id,
      accion: "delete",
      datosAnteriores: prevById.get(id) ?? null,
      datosNuevos: null,
      usuario,
    });
  }
  return entradas;
}

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
    const next = { ...previous, ...patch };
    dataRef.current = next;
    setData(next);

    const ops: Promise<boolean>[] = [];
    const auditoria: AuditoriaEntrada[] = [];
    const usuario = ui.perfilActual?.nombre || null;

    if (patch.clientes) {
      const { cambiados, eliminados } = diffPorId<Cliente>(previous.clientes, patch.clientes);
      if (cambiados.length) ops.push(upsertClientes(cambiados));
      if (eliminados.length) ops.push(deleteClientes(eliminados));
      auditoria.push(...auditEntries("clientes", previous.clientes, cambiados, eliminados, usuario));
    }
    if (patch.ingresos) {
      const prevIds = new Set(previous.ingresos.map((i) => i.id));
      const nuevos = patch.ingresos.filter((i) => !prevIds.has(i.id));
      if (nuevos.length) ops.push(insertIngresos(nuevos));
      auditoria.push(...auditEntries<Ingreso>("ingresos", previous.ingresos, nuevos, [], usuario));
    }
    // citas se resuelve ANTES de tocar ventas (ver más abajo, awaited aparte
    // del resto de `ops`): ventas.citaId tiene FK a citas.id y ambas suelen
    // llegar juntas en el mismo commit (ver registrar() en
    // ServiciosAdicionalesView) — si corrieran en paralelo vía Promise.all,
    // el insert de ventas podía llegar a la base antes que el de citas y
    // violar la FK.
    let citasOk = true;
    try {
      if (patch.citas) {
        const { cambiados, eliminados } = diffPorId<Cita>(previous.citas, patch.citas);
        const citaResults = await Promise.all([
          cambiados.length ? upsertCitas(cambiados) : true,
          eliminados.length ? deleteCitas(eliminados) : true,
        ]);
        citasOk = citaResults.every(Boolean);
        auditoria.push(...auditEntries("citas", previous.citas, cambiados, eliminados, usuario));
      }
    } catch (err) {
      // Server Action inalcanzable (p. ej. operador sin conexión): tratamos
      // esto igual que un guardado fallido en vez de dejar que la promesa
      // rechazada se propague sin manejo (ver `ok` más abajo).
      console.error("No se pudo guardar (citas): posible falla de red", err);
      citasOk = false;
    }

    if (patch.ventas) {
      const prevIds = new Set(previous.ventas.map((v) => v.id));
      const { cambiados, eliminados } = diffPorId<Venta>(previous.ventas, patch.ventas);
      const nuevas = cambiados.filter((v) => !prevIds.has(v.id));
      const editadas = cambiados.filter((v) => prevIds.has(v.id));
      if (nuevas.length) ops.push(insertVentas(nuevas));
      if (editadas.length) ops.push(upsertVentas(editadas));
      if (eliminados.length) ops.push(deleteVentas(eliminados));
      auditoria.push(...auditEntries<Venta>("ventas", previous.ventas, cambiados, eliminados, usuario));
    }
    if (patch.perfiles) {
      const { cambiados, eliminados } = diffPorId<PerfilPublico>(previous.perfiles, patch.perfiles);
      if (cambiados.length) ops.push(upsertPerfiles(cambiados));
      if (eliminados.length) ops.push(deletePerfiles(eliminados));
    }
    // La clave de un perfil nunca se escribe desde acá (perfilToRow no la
    // incluye) — crearla o cambiarla pasa por rutas server-side dedicadas
    // (/api/perfiles/crear, /api/perfiles/cambiar-clave). Perfiles queda
    // fuera del alcance de la auditoría (ver TablaAuditada en @/types).
    if (patch.cupones) {
      const { cambiados, eliminados } = diffPorId<Cupon>(previous.cupones, patch.cupones);
      if (cambiados.length) ops.push(upsertCupones(cambiados));
      if (eliminados.length) ops.push(deleteCupones(eliminados));
      auditoria.push(...auditEntries("cupones", previous.cupones, cambiados, eliminados, usuario));
    }
    if (patch.movimientosContables) {
      const { cambiados, eliminados } = diffPorId<MovimientoContable>(previous.movimientosContables, patch.movimientosContables);
      if (cambiados.length) ops.push(upsertMovimientosContables(cambiados));
      if (eliminados.length) ops.push(deleteMovimientosContables(eliminados));
      auditoria.push(...auditEntries("movimientos_contables", previous.movimientosContables, cambiados, eliminados, usuario));
    }
    if (patch.categoriasGasto) {
      const { cambiados } = diffPorId<CategoriaGasto>(previous.categoriasGasto, patch.categoriasGasto);
      if (cambiados.length) ops.push(upsertCategoriasGasto(cambiados));
    }
    if (patch.empresas) {
      const { cambiados, eliminados } = diffPorId<Empresa>(previous.empresas, patch.empresas);
      if (cambiados.length) ops.push(upsertEmpresas(cambiados));
      if (eliminados.length) ops.push(deleteEmpresas(eliminados));
      auditoria.push(...auditEntries("empresas", previous.empresas, cambiados, eliminados, usuario));
    }
    if (patch.precios) {
      ops.push(upsertPrecios(patch.precios));
    }
    if (patch.servicios) {
      const { cambiados, eliminados } = diffPorId<Servicio>(previous.servicios, patch.servicios);
      if (cambiados.length) ops.push(upsertServicios(cambiados));
      if (eliminados.length) ops.push(deleteServicios(eliminados));
    }
    if (patch.horariosAgenda) {
      const { cambiados, eliminados } = diffPorId<HorarioAgenda>(previous.horariosAgenda, patch.horariosAgenda);
      if (cambiados.length) ops.push(upsertHorariosAgenda(cambiados));
      if (eliminados.length) ops.push(deleteHorariosAgenda(eliminados));
    }
    if (patch.bloqueosAgenda) {
      const { cambiados, eliminados } = diffPorId<BloqueoAgenda>(previous.bloqueosAgenda, patch.bloqueosAgenda);
      if (cambiados.length) ops.push(upsertBloqueosAgenda(cambiados));
      if (eliminados.length) ops.push(deleteBloqueosAgenda(eliminados));
    }
    if (patch.config) {
      ops.push(upsertConfig(patch.config));
    }
    let results: boolean[];
    try {
      results = await Promise.all(ops);
    } catch (err) {
      // Igual que arriba: si el fetch de la Server Action nunca llega al
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
