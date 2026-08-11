import "server-only";

import { asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  alertasMantencion,
  bloqueosAgenda,
  cartolaMovimientos,
  categoriasGasto,
  categoriasIngreso,
  categoriasInsumo,
  categoriasProducto,
  citaServicios,
  citas,
  clientes,
  config,
  cupones,
  destinosInventario,
  empresas,
  horariosAgenda,
  ingresos,
  insumos,
  maquinarias,
  movimientosContables,
  movimientosInventario,
  perfiles,
  plantillasCorreo,
  plantillasWhatsapp,
  precios,
  preciosTamano,
  productos,
  proveedores,
  registrosMantencion,
  reglasConciliacion,
  reglasWhatsapp,
  servicios,
  ventas,
} from "@/db/schema";
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
import type { AppData } from "@/types";
import { bloqueoAgendaFromRow, citaFromRow, horarioAgendaFromRow } from "./agenda";
import { cartolaMovimientoFromRow, categoriaGastoFromRow, categoriaIngresoFromRow, movimientoFromRow, reglaConciliacionFromRow } from "./contabilidad";
import { clienteFromRow } from "./clientes";
import { configFromRow } from "./config";
import { cuponFromRow } from "./cupones";
import { empresaFromRow } from "./empresas";
import { ingresoFromRow } from "./ingresos";
import { categoriaInsumoFromRow, insumoFromRow } from "./inventario/insumos";
import { destinoInventarioFromRow, movimientoInventarioFromRow } from "./inventario/destinos";
import { categoriaProductoFromRow, productoFromRow } from "./inventario/productos";
import { proveedorFromRow } from "./inventario/proveedores";
import { alertaMantencionFromRow, maquinariaFromRow, registroMantencionFromRow } from "./mantencion";
import { plantillaCorreoFromRow } from "./mail";
import { perfilPublicoFromRow } from "./perfiles";
import { preciosFromRows, preciosTamanoFromRows } from "./precios";
import { safe } from "./shared";
import { servicioFromRow } from "./servicios";
import { ventaFromRow } from "./ventas";
import { plantillaWhatsappFromRow, reglaWhatsappFromRow } from "./whatsapp";

export async function waitForStorage(): Promise<boolean> {
  try {
    await getDb().select({ id: config.id }).from(config).limit(1);
    return true;
  } catch (error) {
    console.error("No se pudo conectar a la base de datos", error);
    return false;
  }
}

/** Todo AppData menos las tres tablas de `AppDataHistorial` (ver más abajo). */
export type AppDataCore = Omit<AppData, "ventas" | "ingresos" | "movimientosContables">;

/**
 * `ventas`, `ingresos` y `movimientosContables`: las únicas tablas de
 * AppData que crecen para siempre (una fila más por cada lavado/pago que
 * pasa, todos los días) y ya pesan varios MB en producción — separadas del
 * resto para que AppContext pueda pintar la primera pantalla sin esperarlas.
 * Ver loadCore/loadHistorial y el diagnóstico de performance 2026-08-10.
 */
export type AppDataHistorial = Pick<AppData, "ventas" | "ingresos" | "movimientosContables">;

/**
 * Todo lo que una pantalla necesita para pintar, salvo el historial pesado
 * (ver AppDataHistorial): clientes, catálogos, config, inventario, agenda,
 * etc. Es la oleada "rápida" — hoy ronda ~800kB contra los ~4-5MB de traer
 * todo junto (ver loadAll más abajo, que sigue existiendo por si algún
 * caller server-to-server futuro necesita todo de una vez).
 *
 * `clientes` sale acá con visitas/ultimaVisita "tal cual están en la
 * columna", sin corregir contra `ingresos` (que todavía no se cargó) — ver
 * recalcularVisitasClientes en @/lib/helpers/clientes, que AppContext vuelve
 * a aplicar apenas loadHistorial() resuelve.
 */
export async function loadCore(): Promise<AppDataCore> {
  const db = getDb();
  const [
    clientesRows,
    perfilesRows,
    preciosRows,
    preciosTamanoRows,
    cuponesRows,
    categoriasGastoRows,
    categoriasIngresoRows,
    categoriasProductoRows,
    categoriasInsumoRows,
    empresasRows,
    serviciosRows,
    horariosAgendaRows,
    bloqueosAgendaRows,
    citasRows,
    citaServiciosRows,
    configRows,
    cartolaMovimientosRows,
    reglasConciliacionRows,
    proveedoresRows,
    productosRows,
    insumosRows,
    destinosInventarioRows,
    movimientosInventarioRows,
    maquinariasRows,
    registrosMantencionRows,
    alertasMantencionRows,
    plantillasCorreoRows,
    plantillasWhatsappRows,
    reglasWhatsappRows,
  ] = await Promise.all([
    safe(db.select().from(clientes)),
    safe(db.select({ id: perfiles.id, nombre: perfiles.nombre, modulos: perfiles.modulos, icono: perfiles.icono }).from(perfiles)),
    safe(db.select().from(precios)),
    safe(db.select().from(preciosTamano)),
    safe(db.select().from(cupones).orderBy(desc(cupones.creadoEn))),
    safe(db.select().from(categoriasGasto).orderBy(asc(categoriasGasto.nombre))),
    safe(db.select().from(categoriasIngreso).orderBy(asc(categoriasIngreso.nombre))),
    safe(db.select().from(categoriasProducto).orderBy(asc(categoriasProducto.nombre))),
    safe(db.select().from(categoriasInsumo).orderBy(asc(categoriasInsumo.nombre))),
    safe(db.select().from(empresas).orderBy(asc(empresas.razonSocial))),
    safe(db.select().from(servicios).orderBy(asc(servicios.nombre))),
    safe(db.select().from(horariosAgenda).orderBy(asc(horariosAgenda.diaSemana))),
    safe(db.select().from(bloqueosAgenda).orderBy(asc(bloqueosAgenda.fecha))),
    safe(db.select().from(citas).orderBy(asc(citas.fechaHora))),
    safe(db.select().from(citaServicios)),
    safe(db.select().from(config).limit(1)),
    safe(db.select().from(cartolaMovimientos).orderBy(desc(cartolaMovimientos.fecha))),
    safe(db.select().from(reglasConciliacion).orderBy(asc(reglasConciliacion.id))),
    safe(db.select().from(proveedores).orderBy(asc(proveedores.nombre))),
    safe(db.select().from(productos).orderBy(asc(productos.sku))),
    safe(db.select().from(insumos).orderBy(asc(insumos.nombre))),
    safe(db.select().from(destinosInventario).orderBy(asc(destinosInventario.nombre))),
    safe(db.select().from(movimientosInventario).orderBy(desc(movimientosInventario.fecha))),
    safe(db.select().from(maquinarias).orderBy(asc(maquinarias.nombre))),
    safe(db.select().from(registrosMantencion).orderBy(desc(registrosMantencion.fecha))),
    safe(db.select().from(alertasMantencion).orderBy(asc(alertasMantencion.fechaObjetivo))),
    safe(db.select().from(plantillasCorreo).orderBy(asc(plantillasCorreo.nombre))),
    safe(db.select().from(plantillasWhatsapp).orderBy(asc(plantillasWhatsapp.nombre))),
    safe(db.select().from(reglasWhatsapp).orderBy(asc(reglasWhatsapp.nombre))),
  ]);

  const perfilesData = perfilesRows.length ? perfilesRows.map(perfilPublicoFromRow) : PERFILES_DEFAULT;
  const preciosData = preciosRows.length ? preciosFromRows(preciosRows) : PRECIOS_DEFAULT;
  const preciosTamanoData = preciosTamanoRows.length ? preciosTamanoFromRows(preciosTamanoRows) : PRECIOS_TAMANO_DEFAULT;
  const categoriasGastoData = categoriasGastoRows.length
    ? categoriasGastoRows.map(categoriaGastoFromRow)
    : CATEGORIAS_GASTO_DEFAULT;
  const categoriasIngresoData = categoriasIngresoRows.length
    ? categoriasIngresoRows.map(categoriaIngresoFromRow)
    : CATEGORIAS_INGRESO_DEFAULT;
  const serviciosData = serviciosRows.length ? serviciosRows.map(servicioFromRow) : SERVICIOS_DEFAULT;
  const configData = configRows.length ? configFromRow(configRows[0]) : CONFIG_DEFAULT;
  const plantillasCorreoData = plantillasCorreoRows.length ? plantillasCorreoRows.map(plantillaCorreoFromRow) : PLANTILLAS_CORREO_DEFAULT;
  const plantillasWhatsappData = plantillasWhatsappRows.length
    ? plantillasWhatsappRows.map(plantillaWhatsappFromRow)
    : PLANTILLAS_WHATSAPP_DEFAULT;

  const servicioIdsPorCita = new Map<string, string[]>();
  for (const cs of citaServiciosRows) {
    const lista = servicioIdsPorCita.get(cs.citaId) ?? [];
    lista.push(cs.servicioId);
    servicioIdsPorCita.set(cs.citaId, lista);
  }

  return {
    clientes: clientesRows.map(clienteFromRow),
    perfiles: perfilesData,
    precios: preciosData,
    preciosTamano: preciosTamanoData,
    categoriasGasto: categoriasGastoData,
    categoriasIngreso: categoriasIngresoData,
    categoriasProducto: categoriasProductoRows.map(categoriaProductoFromRow),
    cupones: cuponesRows.map(cuponFromRow),
    empresas: empresasRows.map(empresaFromRow),
    servicios: serviciosData,
    horariosAgenda: horariosAgendaRows.map(horarioAgendaFromRow),
    bloqueosAgenda: bloqueosAgendaRows.map(bloqueoAgendaFromRow),
    citas: citasRows.map((r) => citaFromRow(r, servicioIdsPorCita.get(r.id) ?? [])),
    config: configData,
    cartolaMovimientos: cartolaMovimientosRows.map(cartolaMovimientoFromRow),
    reglasConciliacion: reglasConciliacionRows.map(reglaConciliacionFromRow),
    proveedores: proveedoresRows.map(proveedorFromRow),
    productos: productosRows.map(productoFromRow),
    insumos: insumosRows.map(insumoFromRow),
    categoriasInsumo: categoriasInsumoRows.map(categoriaInsumoFromRow),
    destinosInventario: destinosInventarioRows.map(destinoInventarioFromRow),
    movimientosInventario: movimientosInventarioRows.map(movimientoInventarioFromRow),
    maquinarias: maquinariasRows.map(maquinariaFromRow),
    registrosMantencion: registrosMantencionRows.map(registroMantencionFromRow),
    alertasMantencion: alertasMantencionRows.map(alertaMantencionFromRow),
    plantillasCorreo: plantillasCorreoData,
    plantillasWhatsapp: plantillasWhatsappData,
    reglasWhatsapp: reglasWhatsappRows.map(reglaWhatsappFromRow),
  };
}

/** La oleada "pesada" — ver AppDataHistorial. Se dispara en paralelo con loadCore(), no después. */
export async function loadHistorial(): Promise<AppDataHistorial> {
  const db = getDb();
  const [ingresosRows, ventasRows, movimientosRows] = await Promise.all([
    safe(db.select().from(ingresos).orderBy(desc(ingresos.fecha))),
    safe(db.select().from(ventas).orderBy(desc(ventas.fecha))),
    safe(db.select().from(movimientosContables).orderBy(desc(movimientosContables.fecha))),
  ]);

  return {
    ingresos: ingresosRows.map(ingresoFromRow),
    ventas: ventasRows.map(ventaFromRow),
    movimientosContables: movimientosRows.map(movimientoFromRow),
  };
}

/**
 * Todo AppData de una sola vez, con `clientes.visitas/ultimaVisita` ya
 * corregidos (ver recalcularVisitasClientes). AppContext ya no la usa (carga
 * loadCore()/loadHistorial() por separado, ver ese archivo) — queda para
 * algún caller server-to-server que sí necesite el snapshot completo de una.
 */
export async function loadAll(): Promise<AppData> {
  const [core, historial] = await Promise.all([loadCore(), loadHistorial()]);
  return {
    ...core,
    ...historial,
    clientes: recalcularVisitasClientes(core.clientes, historial.ingresos),
  };
}
