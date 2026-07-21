import "server-only";

import { asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import {
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
  movimientosContables,
  movimientosInventario,
  perfiles,
  precios,
  productos,
  proveedores,
  reglasConciliacion,
  servicios,
  ventas,
} from "@/db/schema";
import {
  CATEGORIAS_GASTO_DEFAULT,
  CATEGORIAS_INGRESO_DEFAULT,
  CONFIG_DEFAULT,
  PERFILES_DEFAULT,
  PRECIOS_DEFAULT,
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
import { perfilPublicoFromRow } from "./perfiles";
import { preciosFromRows } from "./precios";
import { safe } from "./shared";
import { servicioFromRow } from "./servicios";
import { ventaFromRow } from "./ventas";

export async function waitForStorage(): Promise<boolean> {
  try {
    await getDb().select({ id: config.id }).from(config).limit(1);
    return true;
  } catch (error) {
    console.error("No se pudo conectar a la base de datos", error);
    return false;
  }
}

export async function loadAll(): Promise<AppData> {
  const db = getDb();
  const [
    clientesRows,
    ingresosRows,
    ventasRows,
    perfilesRows,
    preciosRows,
    cuponesRows,
    movimientosRows,
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
  ] = await Promise.all([
    safe(db.select().from(clientes)),
    safe(db.select().from(ingresos).orderBy(desc(ingresos.fecha))),
    safe(db.select().from(ventas).orderBy(desc(ventas.fecha))),
    safe(db.select({ id: perfiles.id, nombre: perfiles.nombre, modulos: perfiles.modulos, icono: perfiles.icono }).from(perfiles)),
    safe(db.select().from(precios)),
    safe(db.select().from(cupones).orderBy(desc(cupones.creadoEn))),
    safe(db.select().from(movimientosContables).orderBy(desc(movimientosContables.fecha))),
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
  ]);

  const perfilesData = perfilesRows.length ? perfilesRows.map(perfilPublicoFromRow) : PERFILES_DEFAULT;
  const preciosData = preciosRows.length ? preciosFromRows(preciosRows) : PRECIOS_DEFAULT;
  const categoriasGastoData = categoriasGastoRows.length
    ? categoriasGastoRows.map(categoriaGastoFromRow)
    : CATEGORIAS_GASTO_DEFAULT;
  const categoriasIngresoData = categoriasIngresoRows.length
    ? categoriasIngresoRows.map(categoriaIngresoFromRow)
    : CATEGORIAS_INGRESO_DEFAULT;
  const serviciosData = serviciosRows.length ? serviciosRows.map(servicioFromRow) : SERVICIOS_DEFAULT;
  const configData = configRows.length ? configFromRow(configRows[0]) : CONFIG_DEFAULT;

  const servicioIdsPorCita = new Map<string, string[]>();
  for (const cs of citaServiciosRows) {
    const lista = servicioIdsPorCita.get(cs.citaId) ?? [];
    lista.push(cs.servicioId);
    servicioIdsPorCita.set(cs.citaId, lista);
  }

  // clientes.visitas/ultima_visita se escriben con un upsertClientes()
  // separado del insertIngresos() que crea la fila de Historial de Ingresos
  // que las originó (ver registrarIngreso en @/lib/actions y commit() en
  // AppContext) — dos escrituras independientes, no una transacción. Si una
  // llega a la base y la otra no (conexión intermitente, por ejemplo), el
  // contador queda desincronizado del historial real y no hay forma de que
  // se autocorrija. Para que esto no pueda pasar, acá se recalculan ambos
  // campos a partir de `ingresos` (la fuente de verdad) en cada carga, en
  // vez de confiar en el valor guardado en la columna.
  const visitasPorCliente = new Map<string, { visitas: number; ultimaVisita: string }>();
  for (const r of ingresosRows) {
    if (!r.clienteId) continue;
    const actual = visitasPorCliente.get(r.clienteId);
    visitasPorCliente.set(r.clienteId, {
      visitas: (actual?.visitas ?? 0) + 1,
      ultimaVisita: actual && new Date(actual.ultimaVisita) > new Date(r.fecha) ? actual.ultimaVisita : r.fecha,
    });
  }

  return {
    clientes: clientesRows.map((r) => {
      const c = clienteFromRow(r);
      const real = visitasPorCliente.get(r.id);
      return { ...c, visitas: real?.visitas ?? 0, ultimaVisita: real?.ultimaVisita ?? c.ultimaVisita };
    }),
    ingresos: ingresosRows.map(ingresoFromRow),
    ventas: ventasRows.map(ventaFromRow),
    perfiles: perfilesData,
    precios: preciosData,
    categoriasGasto: categoriasGastoData,
    categoriasIngreso: categoriasIngresoData,
    categoriasProducto: categoriasProductoRows.map(categoriaProductoFromRow),
    cupones: cuponesRows.map(cuponFromRow),
    movimientosContables: movimientosRows.map(movimientoFromRow),
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
  };
}
