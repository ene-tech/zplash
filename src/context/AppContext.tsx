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
import { insertAuditoria, loadCore, loadHistorial, loadPerfilesLogin } from "@/lib/serverActions";
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

interface AppDataContextValue {
  data: AppData;
  /** true mientras hay un commit en vuelo. Los botones que registran plata
   * (venta, ingreso, plan) tienen que deshabilitarse con esto: mientras el
   * commit no vuelve la pantalla no cambia, el operador vuelve a apretar y
   * cada clic guarda otra Venta + Movimiento contable con ids nuevos —
   * UA5066 terminó con 4 "Lavado de Motor" de $29.990 en 48 s el
   * 21-08-2026, GZCP36 con 4 "Lavado único" el 15-08. */
  guardando: boolean;
  storageReady: boolean;
  storageChecked: boolean;
  loading: boolean;
  // true hasta que llega ventas/ingresos/movimientosContables (la "oleada
  // pesada", ver loadHistorial en @/lib/dataAccess/loadAll). Las pantallas
  // que dependen de esas tres tablas deben chequear esto y mostrar su propio
  // estado de carga en vez de operar con arreglos todavía vacíos — ver
  // diagnóstico de performance 2026-08-10.
  loadingHistorial: boolean;
}

interface AppUiContextValue {
  ui: UIState;
}

// Callbacks, aparte de los dos anteriores: no cambian salvo que cambie el
// perfil de la sesión (ver las deps de commit), así que quien solo los
// necesita no se suscribe ni a `data` ni a `ui`.
interface AppAccionesContextValue {
  commit: (patch: Partial<AppData>) => Promise<boolean>;
  patchUi: (patch: Partial<UIState>) => void;
  logout: (extra?: Partial<UIState>) => Promise<void>;
}

type AppContextValue = AppDataContextValue & AppUiContextValue & AppAccionesContextValue;

const AppDataContext = createContext<AppDataContextValue | null>(null);
const AppUiContext = createContext<AppUiContextValue | null>(null);
const AppAccionesContext = createContext<AppAccionesContextValue | null>(null);

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
  const [cargandoPerfiles, setCargandoPerfiles] = useState(true);
  const [loadingHistorial, setLoadingHistorial] = useState(true);
  const [guardando, setGuardando] = useState(false);
  // Id del perfil cuyos datos ya están cargados en `data`. Se compara contra
  // el perfil logueado para derivar `loading` en el MISMO render en que el
  // login setea perfilActual: con un booleano puesto desde el efecto, entre
  // el patchUi({view:"hub"}) y el efecto había un render con la vista del hub
  // ya montada sobre `data` vacía (todo en cero por medio segundo).
  const [perfilCargado, setPerfilCargado] = useState<string | null>(null);

  // Etapa 1 (sin sesión): solo los perfiles, que es lo que LoginScreen
  // necesita para pintar "¿Quién eres?". El resto de AppData ya no se puede
  // pedir sin cookie de sesión (ver loadCore en @/lib/serverActions/loadAll),
  // así que pedirlo acá devolvería un error en vez de datos.
  //
  // Con reintento y sin sonda previa: antes esto llamaba a waitForStorage()
  // (un SELECT extra que solo respondía sí/no) y, si esa única consulta
  // fallaba, la app quedaba en "no se pudo conectar al almacenamiento
  // permanente" sin volver a intentar — aunque la base estuviera bien un
  // segundo después. Los cortes vistos en producción fueron siempre
  // parpadeos del pooler de Supabase (caso 28-08-2026: la base respondía
  // normal minutos más tarde). Además, con la sonda fallada storageReady
  // quedaba en false para toda la sesión aunque los perfiles cargaran bien,
  // y el Topbar mostraba "⚠️ Sin guardado permanente" sin motivo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let intento = 0; intento < 2; intento++) {
        try {
          const perfiles = await loadPerfilesLogin();
          if (cancelled) return;
          if (perfiles.length) {
            const conPerfiles = { ...dataRef.current, perfiles };
            dataRef.current = conPerfiles;
            setData(conPerfiles);
          }
          setStorageReady(true);
          setStorageChecked(true);
          setCargandoPerfiles(false);
          return;
        } catch (error) {
          console.error("No se pudieron cargar los perfiles para el login", error);
          if (cancelled) return;
          // Pinta el aviso de conexión mientras se reintenta, en vez de
          // dejar "Cargando datos..." como si todo fuera bien.
          setStorageChecked(true);
          await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;
        }
      }
      // Los dos intentos fallaron: `cargandoPerfiles` se deja arriba a
      // propósito para que la pantalla siga en el aviso ("intenta recargar")
      // en lugar de caer a un selector de perfiles vacío.
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Etapa 2 (con sesión): recién cuando el login dejó la cookie puesta —
  // /api/perfiles/login la emite antes de que se setee `ui.perfilActual`— se
  // trae AppData. `perfilActual?.id` como dependencia y no `perfilActual`
  // porque patchUi crea un objeto nuevo cada vez y esto recargaría de más.
  const perfilId = ui.perfilActual?.id ?? null;
  useEffect(() => {
    if (!perfilId) return;
    let cancelled = false;
    (async () => {
      setLoadingHistorial(true);
      try {
        // Las dos oleadas se piden en paralelo (loadHistorial() se dispara
        // acá, antes de esperar loadCore()) — lo único que cambia es que la
        // pantalla ya no espera a que ambas terminen: se pinta apenas llega
        // loadCore() y loadHistorial() sigue su curso de fondo, parchando
        // `data` cuando esté lista. Ver diagnóstico de performance 2026-08-10.
        const historialPromise = loadHistorial();

        const core = await loadCore();
        if (cancelled) return;
        const conCore = { ...dataRef.current, ...core };
        dataRef.current = conCore;
        setData(conCore);
        // Recién acá la app es usable: el historial sigue en camino, y para
        // eso está loadingHistorial. Se marca solo en el camino feliz — si
        // loadCore() falla, `loading` queda arriba y admin/page.tsx muestra
        // el aviso de conexión en vez de un panel con todo en cero.
        setPerfilCargado(perfilId);

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
      } catch (error) {
        // Sesión vencida/inválida: loadCore() tira "Sin sesión". No hay nada
        // que mostrar, así que se avisa igual que una caída de almacenamiento
        // en vez de dejar la app con arreglos vacíos que parecen "no hay
        // clientes" ni colgada para siempre en "Cargando datos...".
        console.error("No se pudo cargar la información de la sesión", error);
        if (!cancelled) setStorageReady(false);
      } finally {
        if (!cancelled) setLoadingHistorial(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [perfilId]);

  // Cubre las dos etapas con el mismo flag que ya consume admin/page.tsx: la
  // carga de perfiles antes del login, y la de AppData justo después.
  const loading = cargandoPerfiles || (!!perfilId && perfilCargado !== perfilId);

  const commitInterno = useCallback(async (patch: Partial<AppData>): Promise<boolean> => {
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

    // Si la ficha no se pudo guardar, no se dispara NADA más: antes el resto
    // del commit (ventas incluidas) salía igual, así que una venta de plan
    // rechazada por upsertClientes dejaba el cobro registrado y el plan sin
    // activar — el operador veía "no se pudo guardar", el cliente quedaba
    // vencido, y solo la base lo delataba (caso RRWL69, venta del 25-07-2026).
    // Como el estado local se revierte igual, cortar acá deja la operación
    // completa sin efecto en vez de a medias.
    if (!clientesOk) {
      console.error("No se pudo guardar el cliente: se aborta el resto del commit para no dejar ventas huérfanas");
      dataRef.current = previous;
      setData(previous);
      setStorageReady(false);
      return false;
    }

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
      // ya se confirmó guardada (ver insertAuditoria en @/lib/serverActions).
      insertAuditoria(auditoria);
    }
    return ok;
    // Deps: lee siempre lo último vía dataRef, solo necesita re-crearse si
    // cambia el usuario que queda registrado en la auditoría.
  }, [ui.perfilActual]);

  // Envoltorio que expone `guardando`: el único lugar donde se sabe que hay
  // una escritura en vuelo, para que cualquier botón pueda bloquearse sin
  // llevar su propio estado (ver el comentario de `guardando` arriba).
  const commit = useCallback(
    (patch: Partial<AppData>): Promise<boolean> => {
      setGuardando(true);
      return commitInterno(patch).finally(() => setGuardando(false));
    },
    [commitInterno]
  );

  const patchUi = useCallback((patch: Partial<UIState>) => {
    setUi((prev) => ({ ...prev, ...patch }));
  }, []);

  // Limpia la cookie de sesión en el servidor además de resetear el estado
  // local — sin esto, el login seguía "activo" del lado del servidor (ver
  // @/lib/session) aunque la UI ya mostrara la pantalla de login.
  const logout = useCallback(
    async (extra: Partial<UIState> = {}) => {
      patchUi({ view: "login", perfilActual: null, perfilSeleccionadoId: null, ...extra });
      // Obliga a que el próximo login vuelva a pedir AppData en vez de
      // reusar la del turno anterior (ver `loading` más arriba): la cookie ya
      // no vale, así que lo que quedó en memoria tampoco.
      setPerfilCargado(null);
      try {
        await fetch("/api/perfiles/logout", { method: "POST" });
      } catch {
        // Best-effort: si falla, la cookie expira sola a las 12h (ver crearSesion).
      }
    },
    [patchUi]
  );

  // Tres valores memoizados en vez de uno solo. Memoizar el objeto único
  // evitaba re-renderizar cuando NADA cambiaba, pero no servía para lo que
  // decía este comentario antes: `ui` era una de sus dependencias, así que
  // tipear en un buscador o abrir un modal creaba un valor nuevo igual y
  // volvía a re-renderizar los ~120 componentes que llaman useApp(), cada
  // uno cargando los arreglos completos de AppData.
  //
  // Partido en data / ui / acciones, un cambio de `ui` solo despierta a
  // quienes leen `ui`, y un commit solo a quienes leen `data`. Las acciones
  // van aparte porque son estables salvo cambio de perfil: así useAppData()
  // puede tomar `commit`/`patchUi` sin quedar suscrito a `ui`.
  const valorData = useMemo<AppDataContextValue>(
    () => ({ data, guardando, storageReady, storageChecked, loading, loadingHistorial }),
    [data, guardando, storageReady, storageChecked, loading, loadingHistorial]
  );
  const valorUi = useMemo<AppUiContextValue>(() => ({ ui }), [ui]);
  const valorAcciones = useMemo<AppAccionesContextValue>(
    () => ({ commit, patchUi, logout }),
    [commit, patchUi, logout]
  );

  return (
    <AppAccionesContext.Provider value={valorAcciones}>
      <AppDataContext.Provider value={valorData}>
        <AppUiContext.Provider value={valorUi}>{children}</AppUiContext.Provider>
      </AppDataContext.Provider>
    </AppAccionesContext.Provider>
  );
}

/**
 * Solo los callbacks. Para componentes que no leen nada del estado —modales
 * que únicamente cierran (`patchUi`), botones que disparan un commit—: no se
 * re-renderizan ni por un commit ni por un cambio de UI.
 */
export function useAppAcciones(): AppAccionesContextValue {
  const ctx = useContext(AppAccionesContext);
  if (!ctx) throw new Error("useAppAcciones must be used within AppProvider");
  return ctx;
}

/**
 * Para componentes que leen datos y no `ui`. No se suscribe al contexto de
 * UI, así que abrir un modal o tipear en un buscador ya no los re-renderiza.
 */
export function useAppData(): AppDataContextValue & AppAccionesContextValue {
  const datos = useContext(AppDataContext);
  if (!datos) throw new Error("useAppData must be used within AppProvider");
  return { ...datos, ...useAppAcciones() };
}

/**
 * Para componentes que solo leen `ui` (tabs, modales, filtros). No se
 * suscribe a `data`, así que un commit no los re-renderiza.
 */
export function useAppUi(): AppUiContextValue & AppAccionesContextValue {
  const ui = useContext(AppUiContext);
  if (!ui) throw new Error("useAppUi must be used within AppProvider");
  return { ...ui, ...useAppAcciones() };
}

/** Todo junto, para los componentes que de verdad leen `data` y `ui`. */
export function useApp(): AppContextValue {
  const datos = useContext(AppDataContext);
  const ui = useContext(AppUiContext);
  if (!datos || !ui) throw new Error("useApp must be used within AppProvider");
  return { ...datos, ...ui, ...useAppAcciones() };
}
