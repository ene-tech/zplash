"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, AuditoriaEntrada, UIState } from "@/types";
import {
  CATEGORIAS_GASTO_DEFAULT,
  CATEGORIAS_INGRESO_DEFAULT,
  CONFIG_DEFAULT,
  PERFILES_DEFAULT,
  PLANTILLAS_CORREO_DEFAULT,
  PLANTILLAS_WHATSAPP_DEFAULT,
  PRECIOS_DEFAULT,
  PRECIOS_TAMANO_DEFAULT,
  recalcularVisitasClientes,
  SERVICIOS_DEFAULT,
} from "@/lib/helpers";
import { insertAuditoria, loadCore, loadHistorial, waitForStorage } from "@/lib/serverActions";
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
  commitContratosFuncionario,
  commitConfig,
  commitCupones,
  commitDestinosInventario,
  commitEmpresas,
  commitHorariosAgenda,
  commitIngresos,
  commitInsumos,
  commitMarcasAsistencia,
  commitMaquinarias,
  commitPlanesMantencion,
  commitMovimientosContables,
  commitMovimientosInventario,
  commitPerfiles,
  commitPlantillasCorreo,
  commitPlantillasWhatsapp,
  commitPrecios,
  commitPreciosTamano,
  commitReglasOperador,
  commitProductos,
  commitProveedores,
  commitRegistrosMantencion,
  commitReglasConciliacion,
  commitReglasCorreo,
  commitReglasWhatsapp,
  commitServicios,
  commitTareasTurno,
  commitTareasTurnoHechas,
  commitTurnosFuncionario,
  commitVentas,
  derivarMovimientosDesdeVentas,
  type CommitResult,
} from "@/context/commit";

const initialData: AppData = {
  clientes: [],
  ingresos: [],
  ventas: [],
  precios: JSON.parse(JSON.stringify(PRECIOS_DEFAULT)),
  preciosTamano: JSON.parse(JSON.stringify(PRECIOS_TAMANO_DEFAULT)),
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
  planesMantencion: [],
  registrosMantencion: [],
  alertasMantencion: [],
  plantillasCorreo: JSON.parse(JSON.stringify(PLANTILLAS_CORREO_DEFAULT)),
  reglasCorreo: [],
  plantillasWhatsapp: JSON.parse(JSON.stringify(PLANTILLAS_WHATSAPP_DEFAULT)),
  reglasWhatsapp: [],
  cierresCaja: [],
  turnosFuncionario: [],
  tareasTurno: [],
  tareasTurnoHechas: [],
  marcasAsistencia: [],
  contratosFuncionario: [],
  reglasOperador: [],
};

const initialUI: UIState = {
  view: "login",
  operResult: null,
  adminTab: "clientes",
  contabilidadTab: "egreso",
  webSettingsTab: "precios",
  inventarioTab: "productos",
  mantencionTab: "maquinas",
  funcionarioTab: "turnos",
  equipoTab: "horarios",
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
  clientesFiltroOrigen: "todos",
  clientesPasadasDesde: "",
  clientesPasadasHasta: "",
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
  // true hasta que llega ventas/ingresos/movimientosContables (la "oleada
  // pesada", ver loadHistorial en @/lib/dataAccess/loadAll). Las pantallas
  // que dependen de esas tres tablas deben chequear esto y mostrar su propio
  // estado de carga en vez de operar con arreglos todavía vacíos — ver
  // diagnóstico de performance 2026-08-10.
  loadingHistorial: boolean;
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
  const [loadingHistorial, setLoadingHistorial] = useState(true);

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

      // Las dos oleadas se piden en paralelo (loadHistorial() se dispara acá,
      // antes de esperar loadCore()) — lo único que cambia es que la pantalla
      // ya no espera a que ambas terminen: `loading` baja apenas llega
      // loadCore() y loadHistorial() sigue su curso de fondo, parchando
      // `data` cuando esté lista. Ver diagnóstico de performance 2026-08-10.
      const historialPromise = loadHistorial();

      const core = await loadCore();
      if (cancelled) return;
      const conCore = { ...dataRef.current, ...core };
      dataRef.current = conCore;
      setData(conCore);
      setLoading(false);

      const historial = await historialPromise;
      if (cancelled) return;
      const conHistorial = {
        ...dataRef.current,
        ...historial,
        // clientes ya se pintó con visitas/ultimaVisita "tal cual la
        // columna" (ver loadCore) — recién acá, con `ingresos` disponible,
        // se corrige contra el historial real (ver recalcularVisitasClientes).
        clientes: recalcularVisitasClientes(dataRef.current.clientes, historial.ingresos),
      };
      dataRef.current = conHistorial;
      setData(conHistorial);
      setLoadingHistorial(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback(async (patch: Partial<AppData>): Promise<boolean> => {
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

    // clientes se resuelve y espera ANTES de tocar ingresos/ventas (ver
    // comentario en commitClientes, @/context/commit/clientes): ambas tablas
    // tienen columnas con FK a clientes.id y, al dar de alta un cliente
    // nuevo, esa fila recién existe una vez que este await termina.
    const { ok: clientesOk, auditoria: auditoriaClientes } = await commitClientes(previous.clientes, patch.clientes, usuario);
    auditoria.push(...auditoriaClientes);

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
    agregar(commitPreciosTamano(patch.preciosTamano));
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
    agregar(commitPlanesMantencion(previous.planesMantencion, patch.planesMantencion));
    agregar(commitRegistrosMantencion(previous.registrosMantencion, patch.registrosMantencion));
    agregar(commitAlertasMantencion(previous.alertasMantencion, patch.alertasMantencion));
    agregar(commitPlantillasCorreo(previous.plantillasCorreo, patch.plantillasCorreo));
    agregar(commitReglasCorreo(previous.reglasCorreo, patch.reglasCorreo));
    agregar(commitPlantillasWhatsapp(previous.plantillasWhatsapp, patch.plantillasWhatsapp));
    agregar(commitReglasWhatsapp(previous.reglasWhatsapp, patch.reglasWhatsapp));
    agregar(commitTurnosFuncionario(previous.turnosFuncionario, patch.turnosFuncionario));
    agregar(commitTareasTurno(previous.tareasTurno, patch.tareasTurno));
    agregar(commitTareasTurnoHechas(previous.tareasTurnoHechas, patch.tareasTurnoHechas));
    agregar(commitMarcasAsistencia(previous.marcasAsistencia, patch.marcasAsistencia));
    agregar(commitContratosFuncionario(previous.contratosFuncionario, patch.contratosFuncionario));
    agregar(commitReglasOperador(previous.reglasOperador, patch.reglasOperador));

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
    const ok = clientesOk && citasOk && results.every(Boolean);
    setStorageReady(ok);
    if (!ok) {
      console.error("No se pudo guardar toda la información en el almacenamiento persistente");
      // Revertimos el estado local: si no se guardó en Supabase, la app no debe
      // seguir mostrando el cambio como aplicado (otras sesiones nunca lo verán).
      dataRef.current = previous;
      setData(previous);
    } else if (auditoria.length) {
      // Best-effort: un fallo acá no revierte la escritura de negocio, que
      // ya se confirmó guardada (ver insertAuditoria en @/lib/serverActions).
      insertAuditoria(auditoria);
    }
    return ok;
    // Deps: lee siempre lo último vía dataRef, solo necesita re-crearse si
    // cambia el usuario que queda registrado en la auditoría.
  }, [ui.perfilActual]);

  const patchUi = useCallback((patch: Partial<UIState>) => {
    setUi((prev) => ({ ...prev, ...patch }));
  }, []);

  // Limpia la cookie de sesión en el servidor además de resetear el estado
  // local — sin esto, el login seguía "activo" del lado del servidor (ver
  // @/lib/session) aunque la UI ya mostrara la pantalla de login.
  const logout = useCallback(
    async (extra: Partial<UIState> = {}) => {
      patchUi({ view: "login", perfilActual: null, perfilSeleccionadoId: null, ...extra });
      try {
        await fetch("/api/perfiles/logout", { method: "POST" });
      } catch {
        // Best-effort: si falla, la cookie expira sola a las 12h (ver crearSesion).
      }
    },
    [patchUi]
  );

  // Memoizado: sin esto, este objeto es nuevo en cada render del provider y
  // React re-renderiza TODO componente que llama useApp() cada vez — incluso
  // los que no leen el pedazo de estado que cambió (p.ej. escribir en un
  // buscador re-renderizaba tablas de miles de filas que no dependen de
  // `ui.search`). Ver diagnóstico de performance 2026-08-09.
  const value = useMemo<AppContextValue>(
    () => ({ data, commit, ui, patchUi, storageReady, storageChecked, loading, loadingHistorial, logout }),
    [data, commit, ui, patchUi, storageReady, storageChecked, loading, loadingHistorial, logout]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
