import "server-only";

// Capa de acceso a datos "cruda": sin chequeos de sesión/permiso. La usan
// dos tipos de caller, cada uno con su propia forma de autenticarse antes de
// llegar acá:
//   1) Los Server Actions de @/lib/db (capa fina, ver ese archivo), que
//      exigen una sesión de perfil válida antes de delegar acá.
//   2) Rutas server-to-server que no tienen perfil logueado pero ya
//      verificaron al llamante por otro medio (ej. lib/whatsapp/router.ts,
//      protegido por la firma de Twilio en /api/whatsapp).
// Este archivo no lleva "use server": al no tener esa directiva, ninguna de
// estas funciones queda expuesta como endpoint invocable directamente desde
// el navegador, sin importar quién la importe.

import { asc, desc, eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import {
  auditoria,
  bloqueosAgenda,
  cartolaMovimientos,
  categoriasGasto,
  categoriasIngreso,
  citaServicios,
  citas,
  clientes,
  cobrosOneclick,
  config,
  cupones,
  empresas,
  horariosAgenda,
  ingresos,
  movimientosContables,
  pagosWebpay,
  pagosWebpayItems,
  perfiles,
  precios,
  reglasConciliacion,
  servicios,
  suscripcionesOneclick,
  ventas,
} from "@/db/schema";
import { supabase } from "@/lib/supabase";
import { oneclickInscription } from "@/lib/transbank";
import {
  CATEGORIAS_GASTO_DEFAULT,
  CATEGORIAS_INGRESO_DEFAULT,
  CONFIG_DEFAULT,
  PERFILES_DEFAULT,
  PRECIOS_DEFAULT,
  SERVICIOS_DEFAULT,
} from "@/lib/helpers";
import type {
  AppData,
  AuditoriaEntrada,
  BloqueoAgenda,
  CartolaMovimiento,
  CategoriaGasto,
  CategoriaIngreso,
  Cita,
  Cliente,
  ConfigGlobal,
  Cupon,
  Empresa,
  HorarioAgenda,
  Ingreso,
  MovimientoContable,
  PerfilPublico,
  Precios,
  ReglaConciliacion,
  Servicio,
  Venta,
} from "@/types";

type ClienteRow = typeof clientes.$inferSelect;
type IngresoRow = typeof ingresos.$inferSelect;
type VentaRow = typeof ventas.$inferSelect;
type PerfilPublicoRow = Pick<typeof perfiles.$inferSelect, "id" | "nombre" | "modulos" | "icono">;
type CategoriaGastoRow = typeof categoriasGasto.$inferSelect;
type CategoriaIngresoRow = typeof categoriasIngreso.$inferSelect;
type CuponRow = typeof cupones.$inferSelect;
type MovimientoRow = typeof movimientosContables.$inferSelect;
type PrecioRow = typeof precios.$inferSelect;
type EmpresaRow = typeof empresas.$inferSelect;
type ServicioRow = typeof servicios.$inferSelect;
type HorarioAgendaRow = typeof horariosAgenda.$inferSelect;
type BloqueoAgendaRow = typeof bloqueosAgenda.$inferSelect;
type CitaRow = typeof citas.$inferSelect;
type ConfigRow = typeof config.$inferSelect;
type CartolaMovimientoRow = typeof cartolaMovimientos.$inferSelect;
type ReglaConciliacionRow = typeof reglasConciliacion.$inferSelect;

function clienteToRow(c: Cliente): typeof clientes.$inferInsert {
  return {
    id: c.id,
    nombre: c.nombre,
    patente: c.patente,
    telefono: c.telefono || null,
    email: c.email || null,
    vehiculo: c.vehiculo || null,
    plan: c.plan || null,
    tipoDocumento: c.tipoDocumento || null,
    razonSocial: c.razonSocial || null,
    rut: c.rut || null,
    direccion: c.direccion || null,
    giro: c.giro || null,
    vencimiento: c.vencimiento || null,
    fechaContratacion: c.fechaContratacion || null,
    origen: c.origen || "LOCAL",
    visitas: c.visitas || 0,
    ultimaVisita: c.ultimaVisita || null,
    ultimaRenovacion: c.ultimaRenovacion || null,
    creadoEn: c.creadoEn,
    creadoPor: c.creadoPor || null,
  };
}

function clienteFromRow(r: ClienteRow): Cliente {
  return {
    id: r.id,
    nombre: r.nombre,
    patente: r.patente,
    telefono: r.telefono || undefined,
    email: r.email || undefined,
    vehiculo: r.vehiculo || undefined,
    plan: r.plan || undefined,
    tipoDocumento: (r.tipoDocumento as Cliente["tipoDocumento"]) || undefined,
    razonSocial: r.razonSocial || undefined,
    rut: r.rut || undefined,
    direccion: r.direccion || undefined,
    giro: r.giro || undefined,
    vencimiento: r.vencimiento || null,
    fechaContratacion: r.fechaContratacion || null,
    origen: (r.origen as Cliente["origen"]) || "LOCAL",
    visitas: r.visitas || 0,
    ultimaVisita: r.ultimaVisita || undefined,
    ultimaRenovacion: r.ultimaRenovacion || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

function ingresoToRow(i: Ingreso): typeof ingresos.$inferInsert {
  return {
    id: i.id,
    // "" representa "sin cliente" (lavado sin registro, canje de cupón) en
    // memoria — se normaliza a NULL real para poder agregar una FK a
    // clientes sin romper esos flujos (ver supabase/add-foreign-keys.sql).
    clienteId: i.clienteId || null,
    patente: i.patente,
    nombre: i.nombre,
    fecha: i.fecha,
    planEstadoAlIngreso: i.planEstadoAlIngreso,
    creadoPor: i.creadoPor || null,
    esGarantia: i.esGarantia || false,
    viaCupon: i.viaCupon || false,
    cuponCodigo: i.cuponCodigo || null,
    glosa: i.glosa || null,
    citaId: i.citaId || null,
  };
}

function ingresoFromRow(r: IngresoRow): Ingreso {
  return {
    id: r.id,
    clienteId: r.clienteId || "",
    patente: r.patente,
    nombre: r.nombre,
    fecha: r.fecha,
    planEstadoAlIngreso: r.planEstadoAlIngreso as Ingreso["planEstadoAlIngreso"],
    creadoPor: r.creadoPor || undefined,
    esGarantia: r.esGarantia || undefined,
    viaCupon: r.viaCupon || undefined,
    cuponCodigo: r.cuponCodigo || undefined,
    glosa: r.glosa || undefined,
    citaId: r.citaId || undefined,
  };
}

function ventaToRow(v: Venta): typeof ventas.$inferInsert {
  return {
    id: v.id,
    // "" representa "sin cliente" (lavado sin registro, Venta Empresa) en
    // memoria — se normaliza a NULL real para poder agregar una FK a
    // clientes sin romper esos flujos (ver supabase/add-foreign-keys.sql).
    clienteId: v.clienteId || null,
    patente: v.patente,
    nombre: v.nombre,
    plan: v.plan || "",
    precio: v.precio || 0,
    tipo: v.tipo,
    fecha: v.fecha,
    creadoPor: v.creadoPor || null,
    metodoPago: v.metodoPago || null,
    voucher: v.voucher || null,
    horaEntrega: v.horaEntrega || null,
    fechaEntrega: v.fechaEntrega || null,
    citaId: v.citaId || null,
    cantidadItems: v.cantidadItems || 1,
    notas: v.notas || null,
    estadoPago: v.estadoPago || null,
    montoCobrado: v.montoCobrado ?? null,
    esServicioAdicional: v.esServicioAdicional || false,
    tipoDocumento: v.tipoDocumento || null,
    razonSocial: v.razonSocial || null,
    rut: v.rut || null,
    direccion: v.direccion || null,
    giro: v.giro || null,
    email: v.email || null,
    viaCupon: v.viaCupon || false,
    cuponCodigo: v.cuponCodigo || null,
  };
}

function ventaFromRow(r: VentaRow): Venta {
  return {
    id: r.id,
    clienteId: r.clienteId || "",
    patente: r.patente,
    nombre: r.nombre,
    plan: r.plan || "",
    precio: r.precio || 0,
    tipo: r.tipo,
    fecha: r.fecha,
    creadoPor: r.creadoPor || undefined,
    metodoPago: (r.metodoPago as Venta["metodoPago"]) || undefined,
    voucher: r.voucher || undefined,
    horaEntrega: r.horaEntrega || undefined,
    fechaEntrega: r.fechaEntrega || undefined,
    citaId: r.citaId || undefined,
    cantidadItems: r.cantidadItems || undefined,
    notas: r.notas || undefined,
    estadoPago: (r.estadoPago as Venta["estadoPago"]) || undefined,
    montoCobrado: r.montoCobrado === null || r.montoCobrado === undefined ? undefined : r.montoCobrado,
    esServicioAdicional: r.esServicioAdicional || undefined,
    tipoDocumento: (r.tipoDocumento as Venta["tipoDocumento"]) || undefined,
    razonSocial: r.razonSocial || undefined,
    rut: r.rut || undefined,
    direccion: r.direccion || undefined,
    giro: r.giro || undefined,
    email: r.email || undefined,
    viaCupon: r.viaCupon || undefined,
    cuponCodigo: r.cuponCodigo || undefined,
  };
}

// Nunca incluye "clave": la tabla perfiles solo acepta escrituras de
// nombre/modulos desde acá (ver upsertPerfiles). Crear un perfil nuevo o
// cambiar una clave pasa por rutas server-side dedicadas (/api/perfiles/*).
function perfilToRow(p: PerfilPublico): Omit<typeof perfiles.$inferInsert, "clave"> {
  return { id: p.id, nombre: p.nombre, modulos: p.modulos, icono: p.icono || null };
}

function perfilPublicoFromRow(r: PerfilPublicoRow): PerfilPublico {
  return {
    id: r.id,
    nombre: r.nombre,
    modulos: (r.modulos as PerfilPublico["modulos"]) || [],
    icono: r.icono || undefined,
  };
}

function categoriaGastoToRow(c: CategoriaGasto): typeof categoriasGasto.$inferInsert {
  return { id: c.id, nombre: c.nombre, grupo: c.grupo, activa: c.activa };
}

function categoriaGastoFromRow(r: CategoriaGastoRow): CategoriaGasto {
  return { id: r.id, nombre: r.nombre, grupo: r.grupo, activa: r.activa };
}

function categoriaIngresoToRow(c: CategoriaIngreso): typeof categoriasIngreso.$inferInsert {
  return { id: c.id, nombre: c.nombre, activa: c.activa };
}

function categoriaIngresoFromRow(r: CategoriaIngresoRow): CategoriaIngreso {
  return { id: r.id, nombre: r.nombre, activa: r.activa };
}

function cuponToRow(c: Cupon): typeof cupones.$inferInsert {
  return {
    id: c.id,
    codigo: c.codigo,
    nombreLote: c.nombreLote,
    valor: c.valor || 0,
    numeroLote: c.numeroLote || 1,
    totalLote: c.totalLote || 1,
    fechaCaducidad: c.fechaCaducidad,
    usado: c.usado || false,
    patenteUso: c.patenteUso || null,
    fechaUso: c.fechaUso || null,
    operadorUso: c.operadorUso || null,
    creadoEn: c.creadoEn,
    creadoPor: c.creadoPor || null,
    tipo: c.tipo || "vale",
    patenteAsignada: c.patenteAsignada || null,
    esPorcentaje: c.esPorcentaje || false,
    rut: c.rut || null,
    patentesAutorizadas: c.patentesAutorizadas?.length ? c.patentesAutorizadas : null,
    email: c.email || null,
  };
}

function cuponFromRow(r: CuponRow): Cupon {
  return {
    id: r.id,
    codigo: r.codigo,
    nombreLote: r.nombreLote,
    valor: r.valor || 0,
    numeroLote: r.numeroLote || 1,
    totalLote: r.totalLote || 1,
    fechaCaducidad: r.fechaCaducidad,
    usado: r.usado || false,
    patenteUso: r.patenteUso || undefined,
    fechaUso: r.fechaUso || undefined,
    operadorUso: r.operadorUso || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
    tipo: (r.tipo as Cupon["tipo"]) || "vale",
    patenteAsignada: r.patenteAsignada || undefined,
    esPorcentaje: r.esPorcentaje || false,
    rut: r.rut || undefined,
    patentesAutorizadas: r.patentesAutorizadas?.length ? r.patentesAutorizadas : undefined,
    email: r.email || undefined,
  };
}

function movimientoToRow(m: MovimientoContable): typeof movimientosContables.$inferInsert {
  return {
    id: m.id,
    tipo: m.tipo,
    fecha: m.fecha,
    descripcion: m.descripcion,
    categoria: m.categoria || null,
    contraparte: m.contraparte || null,
    rutProveedor: m.rutProveedor || null,
    numeroFactura: m.numeroFactura || null,
    tipoDocumento: m.tipoDocumento || null,
    documentoUrl: m.documentoUrl || null,
    documentoNombre: m.documentoNombre || null,
    monto: m.monto || 0,
    estado: m.estado,
    metodoPago: m.metodoPago || null,
    notas: m.notas || null,
    creadoEn: m.creadoEn,
    creadoPor: m.creadoPor || null,
  };
}

function movimientoFromRow(r: MovimientoRow): MovimientoContable {
  return {
    id: r.id,
    tipo: r.tipo as MovimientoContable["tipo"],
    fecha: r.fecha,
    descripcion: r.descripcion,
    categoria: r.categoria || undefined,
    contraparte: r.contraparte || undefined,
    rutProveedor: r.rutProveedor || undefined,
    numeroFactura: r.numeroFactura || undefined,
    tipoDocumento: (r.tipoDocumento as MovimientoContable["tipoDocumento"]) || undefined,
    documentoUrl: r.documentoUrl || undefined,
    documentoNombre: r.documentoNombre || undefined,
    monto: r.monto || 0,
    estado: (r.estado as MovimientoContable["estado"]) || "pendiente",
    metodoPago: (r.metodoPago as MovimientoContable["metodoPago"]) || undefined,
    notas: r.notas || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

function cartolaMovimientoToRow(m: CartolaMovimiento): typeof cartolaMovimientos.$inferInsert {
  return {
    id: m.id,
    cuenta: m.cuenta || "santander_empresa",
    fecha: m.fecha,
    glosa: m.glosa,
    cargo: m.cargo || 0,
    abono: m.abono || 0,
    saldo: m.saldo ?? null,
    numeroDocumento: m.numeroDocumento || null,
    sucursal: m.sucursal || null,
    categoria: m.categoria || null,
    estado: m.estado,
    movimientoContableId: m.movimientoContableId || null,
    notas: m.notas || null,
    creadoEn: m.creadoEn,
    creadoPor: m.creadoPor || null,
  };
}

function cartolaMovimientoFromRow(r: CartolaMovimientoRow): CartolaMovimiento {
  return {
    id: r.id,
    cuenta: r.cuenta,
    fecha: r.fecha,
    glosa: r.glosa,
    cargo: r.cargo || 0,
    abono: r.abono || 0,
    saldo: r.saldo ?? undefined,
    numeroDocumento: r.numeroDocumento || undefined,
    sucursal: r.sucursal || undefined,
    categoria: r.categoria || undefined,
    estado: (r.estado as CartolaMovimiento["estado"]) || "pendiente",
    movimientoContableId: r.movimientoContableId || undefined,
    notas: r.notas || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

function reglaConciliacionToRow(r: ReglaConciliacion): typeof reglasConciliacion.$inferInsert {
  return { id: r.id, categoria: r.categoria, creadoEn: r.creadoEn };
}

function reglaConciliacionFromRow(r: ReglaConciliacionRow): ReglaConciliacion {
  return { id: r.id, categoria: r.categoria, creadoEn: r.creadoEn };
}

function empresaToRow(e: Empresa): typeof empresas.$inferInsert {
  return {
    id: e.id,
    razonSocial: e.razonSocial,
    rut: e.rut,
    giro: e.giro || null,
    direccion: e.direccion || null,
    telefono: e.telefono || null,
    contactoClienteId: e.contactoClienteId || null,
    contactoNombre: e.contactoNombre || null,
    creadoEn: e.creadoEn,
    creadoPor: e.creadoPor || null,
  };
}

function empresaFromRow(r: EmpresaRow): Empresa {
  return {
    id: r.id,
    razonSocial: r.razonSocial,
    rut: r.rut,
    giro: r.giro || undefined,
    direccion: r.direccion || undefined,
    telefono: r.telefono || undefined,
    contactoClienteId: r.contactoClienteId || undefined,
    contactoNombre: r.contactoNombre || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

function servicioToRow(s: Servicio): typeof servicios.$inferInsert {
  return { id: s.id, nombre: s.nombre, categoria: s.categoria || null, duracionMinutos: s.duracionMinutos, activo: s.activo };
}

function servicioFromRow(r: ServicioRow): Servicio {
  return { id: r.id, nombre: r.nombre, categoria: r.categoria || undefined, duracionMinutos: r.duracionMinutos, activo: r.activo };
}

function configToRow(c: ConfigGlobal): typeof config.$inferInsert {
  return {
    id: true,
    horarioOperadorSemanaInicio: c.horarioOperadorSemanaInicio,
    horarioOperadorSemanaFin: c.horarioOperadorSemanaFin,
    horarioOperadorFindeInicio: c.horarioOperadorFindeInicio,
    horarioOperadorFindeFin: c.horarioOperadorFindeFin,
    festivos: c.festivos,
    vigenciaDiasPackEmpresa: c.vigenciaDiasPackEmpresa,
    tramosRenovacionLocal: c.tramosRenovacionLocal,
  };
}

function configFromRow(r: ConfigRow): ConfigGlobal {
  return {
    horarioOperadorSemanaInicio: r.horarioOperadorSemanaInicio,
    horarioOperadorSemanaFin: r.horarioOperadorSemanaFin,
    horarioOperadorFindeInicio: r.horarioOperadorFindeInicio,
    horarioOperadorFindeFin: r.horarioOperadorFindeFin,
    festivos: r.festivos ?? [],
    vigenciaDiasPackEmpresa: r.vigenciaDiasPackEmpresa || 365,
    tramosRenovacionLocal: r.tramosRenovacionLocal ?? {},
  };
}

function horarioAgendaToRow(h: HorarioAgenda): typeof horariosAgenda.$inferInsert {
  return { id: h.id, diaSemana: h.diaSemana, horaInicio: h.horaInicio, horaFin: h.horaFin };
}

function horarioAgendaFromRow(r: HorarioAgendaRow): HorarioAgenda {
  return { id: r.id, diaSemana: r.diaSemana, horaInicio: r.horaInicio, horaFin: r.horaFin };
}

function bloqueoAgendaToRow(b: BloqueoAgenda): typeof bloqueosAgenda.$inferInsert {
  return {
    id: b.id,
    fecha: b.fecha,
    todoElDia: b.todoElDia,
    horaInicio: b.horaInicio || null,
    horaFin: b.horaFin || null,
    motivo: b.motivo || null,
    creadoEn: b.creadoEn,
    creadoPor: b.creadoPor || null,
  };
}

function bloqueoAgendaFromRow(r: BloqueoAgendaRow): BloqueoAgenda {
  return {
    id: r.id,
    fecha: r.fecha,
    todoElDia: r.todoElDia,
    horaInicio: r.horaInicio || undefined,
    horaFin: r.horaFin || undefined,
    motivo: r.motivo || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

function citaToRow(c: Cita): typeof citas.$inferInsert {
  return {
    id: c.id,
    clienteId: c.clienteId || null,
    patente: c.patente,
    nombre: c.nombre,
    telefono: c.telefono || null,
    fechaHora: c.fechaHora,
    duracionMinutos: c.duracionMinutos,
    estado: c.estado,
    notas: c.notas || null,
    origen: c.origen,
    creadoPor: c.creadoPor || null,
    creadoEn: c.creadoEn,
  };
}

/** servicioIds viene resuelto aparte (join con cita_servicios, ver loadAll) porque no vive en la fila de `citas`. */
function citaFromRow(r: CitaRow, servicioIds: string[]): Cita {
  return {
    id: r.id,
    clienteId: r.clienteId || undefined,
    servicioIds,
    patente: r.patente,
    nombre: r.nombre,
    telefono: r.telefono || undefined,
    fechaHora: r.fechaHora,
    duracionMinutos: r.duracionMinutos,
    estado: r.estado as Cita["estado"],
    notas: r.notas || undefined,
    origen: r.origen as Cita["origen"],
    creadoPor: r.creadoPor || undefined,
    creadoEn: r.creadoEn,
  };
}

function preciosFromRows(rows: PrecioRow[]): Precios {
  const result: Precios = {};
  for (const r of rows) {
    result[r.plan] = { normal: r.normal || 0, promo: r.promo || 0 };
  }
  return result;
}

// Cada query de loadAll se aísla: si una tabla falla (o la conexión no está
// lista aún), las demás igual se cargan y esta cae a [] — lo mismo que hacía
// antes el chequeo de `res.error` por separado con supabase-js. Los `?.length`
// más abajo hacen que un [] caiga a los valores DEFAULT correspondientes.
async function safe<T>(query: Promise<T[]>): Promise<T[]> {
  try {
    return await query;
  } catch (error) {
    console.error("Error cargando datos de la base de datos", error);
    return [];
  }
}

function buildConflictUpdateColumns<T extends PgTable>(table: T, columns: string[]): Record<string, SQL> {
  const cls = getTableColumns(table);
  const set: Record<string, SQL> = {};
  for (const column of columns) {
    set[column] = sql.raw(`excluded.${cls[column].name}`);
  }
  return set;
}

// Upsert genérico: inserta `rows` y, si el valor de `target` ya existe,
// actualiza el resto de las columnas presentes en cada fila. Comparte esta
// lógica entre las 6 tablas que hacen upsert en vez de repetirla.
async function upsertRows<T extends PgTable>(table: T, target: PgColumn, rows: Record<string, unknown>[]): Promise<void> {
  const columns = Object.keys(rows[0]).filter((k) => k !== target.name);
  await getDb()
    .insert(table)
    .values(rows as never[])
    .onConflictDoUpdate({ target, set: buildConflictUpdateColumns(table, columns) });
}

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
    empresasRows,
    serviciosRows,
    horariosAgendaRows,
    bloqueosAgendaRows,
    citasRows,
    citaServiciosRows,
    configRows,
    cartolaMovimientosRows,
    reglasConciliacionRows,
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
    safe(db.select().from(empresas).orderBy(asc(empresas.razonSocial))),
    safe(db.select().from(servicios).orderBy(asc(servicios.nombre))),
    safe(db.select().from(horariosAgenda).orderBy(asc(horariosAgenda.diaSemana))),
    safe(db.select().from(bloqueosAgenda).orderBy(asc(bloqueosAgenda.fecha))),
    safe(db.select().from(citas).orderBy(asc(citas.fechaHora))),
    safe(db.select().from(citaServicios)),
    safe(db.select().from(config).limit(1)),
    safe(db.select().from(cartolaMovimientos).orderBy(desc(cartolaMovimientos.fecha))),
    safe(db.select().from(reglasConciliacion).orderBy(asc(reglasConciliacion.id))),
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
  };
}

/** Lectura directa (sin pasar por loadAll) para el chequeo server-side del bloqueo
 * horario del módulo Operador (ver insertIngresos en @/lib/db) — no confía en el
 * horario que traiga el cliente en AppData, que podría estar desactualizado o alterado. */
export async function getConfig(): Promise<ConfigGlobal> {
  const [row] = await getDb().select().from(config).limit(1);
  return row ? configFromRow(row) : CONFIG_DEFAULT;
}

export async function upsertConfig(cfg: ConfigGlobal): Promise<boolean> {
  try {
    await upsertRows(config, config.id, [configToRow(cfg)]);
    return true;
  } catch (error) {
    console.error("Error guardando configuración", error);
    return false;
  }
}

export async function upsertClientes(rows: Cliente[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(clientes, clientes.id, rows.map(clienteToRow));
    return true;
  } catch (error) {
    // El upsert en lote (un solo INSERT ... ON CONFLICT(id) para todas las
    // filas) falla completo si UNA sola fila choca con la restricción única
    // de `patente` — por ejemplo, otro admin registró esa patente después de
    // que este navegador cargó sus datos (la carga masiva por Excel detecta
    // duplicados contra la copia en memoria, no contra la base), o dos filas
    // del mismo Excel normalizan a la misma patente. Sin este fallback, se
    // perdían en pantalla TODOS los clientes del lote — incluidos los
    // legítimos — hasta recargar la página, sin indicar cuál fue el
    // problema. Acá se reintenta fila por fila para aislar solo la(s)
    // fila(s) realmente conflictivas y no perder el resto.
    console.error("Error guardando clientes en lote, reintentando fila por fila", error);
    let algunaFalla = false;
    for (const row of rows) {
      try {
        await upsertRows(clientes, clientes.id, [clienteToRow(row)]);
      } catch (errorFila) {
        algunaFalla = true;
        console.error("No se pudo guardar el cliente (probable choque de patente con otro id)", row.id, row.patente, errorFila);
      }
    }
    return !algunaFalla;
  }
}

export async function deleteClientes(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(clientes).where(inArray(clientes.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando clientes", error);
    return false;
  }
}

export async function insertIngresos(rows: Ingreso[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await getDb().insert(ingresos).values(rows.map(ingresoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando ingresos", error);
    return false;
  }
}

export async function insertVentas(rows: Venta[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await getDb().insert(ventas).values(rows.map(ventaToRow));
    return true;
  } catch (error) {
    console.error("Error guardando ventas", error);
    return false;
  }
}

// A diferencia de insertVentas (solo altas), esto permite actualizar una
// venta ya guardada — necesario para completar el pago de un saldo pendiente
// al retirar el vehículo (ver cambiarStatusCita en ServiciosAdicionalesView).
export async function upsertVentas(rows: Venta[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(ventas, ventas.id, rows.map(ventaToRow));
    return true;
  } catch (error) {
    console.error("Error actualizando ventas", error);
    return false;
  }
}

// Borra también el pago Transbank (Webpay Plus u Oneclick) que haya generado
// la venta, si tuvo uno: las tablas de pago guardan `ventaId` con onDelete
// "set null", así que sin este paso previo quedarían filas huérfanas en vez
// de desaparecer junto con el servicio que las originó.
//
// `pagosWebpay.ventaId` solo queda seteado en compras legacy de un solo ítem
// (antes de existir `pagosWebpayItems`) — ahí sí se borra la fila entera. Una
// compra por carrito guarda el `ventaId` en `pagosWebpayItems`; borrar una de
// esas ventas borra solo su fila de ítem, dejando intacta la fila padre de
// `pagosWebpay` (que sigue siendo el registro fiel de lo que Transbank cobró
// en total, aunque se corrija un ítem después).
export async function deleteVentas(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    const db = getDb();
    await db.delete(pagosWebpay).where(inArray(pagosWebpay.ventaId, ids));
    await db.delete(pagosWebpayItems).where(inArray(pagosWebpayItems.ventaId, ids));
    await db.delete(cobrosOneclick).where(inArray(cobrosOneclick.ventaId, ids));
    await db.delete(ventas).where(inArray(ventas.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando ventas", error);
    return false;
  }
}

// Solo actualiza nombre/modulos (ver perfilToRow) de perfiles que YA
// existen: crear un perfil nuevo con su clave inicial pasa por
// /api/perfiles/crear. Por eso es un UPDATE directo y no un upsert — un
// INSERT (aunque termine resolviendo por ON CONFLICT DO UPDATE) exige que
// la fila propuesta satisfaga el NOT NULL de "clave", que perfilToRow omite
// a propósito para no tocar la contraseña.
export async function upsertPerfiles(rows: PerfilPublico[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    const db = getDb();
    await Promise.all(rows.map((p) => db.update(perfiles).set(perfilToRow(p)).where(eq(perfiles.id, p.id))));
    return true;
  } catch (error) {
    console.error("Error guardando perfiles", error);
    return false;
  }
}

export async function deletePerfiles(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(perfiles).where(inArray(perfiles.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando perfiles", error);
    return false;
  }
}

export async function upsertPrecios(precios_: Precios): Promise<boolean> {
  const rows = Object.entries(precios_).map(([plan, v]) => ({ plan, normal: v.normal, promo: v.promo }));
  if (!rows.length) return true;
  try {
    await upsertRows(precios, precios.plan, rows);
    return true;
  } catch (error) {
    console.error("Error guardando precios", error);
    return false;
  }
}

export async function upsertCupones(rows: Cupon[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(cupones, cupones.id, rows.map(cuponToRow));
    return true;
  } catch (error) {
    console.error("Error guardando cupones", error);
    return false;
  }
}

export async function deleteCupones(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(cupones).where(inArray(cupones.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando cupones", error);
    return false;
  }
}

export async function upsertMovimientosContables(rows: MovimientoContable[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(movimientosContables, movimientosContables.id, rows.map(movimientoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando movimientos contables", error);
    return false;
  }
}

export async function deleteMovimientosContables(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(movimientosContables).where(inArray(movimientosContables.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando movimientos contables", error);
    return false;
  }
}

export async function upsertCartolaMovimientos(rows: CartolaMovimiento[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(cartolaMovimientos, cartolaMovimientos.id, rows.map(cartolaMovimientoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando movimientos de cartola", error);
    return false;
  }
}

export async function deleteCartolaMovimientos(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(cartolaMovimientos).where(inArray(cartolaMovimientos.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando movimientos de cartola", error);
    return false;
  }
}

export async function upsertReglasConciliacion(rows: ReglaConciliacion[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(reglasConciliacion, reglasConciliacion.id, rows.map(reglaConciliacionToRow));
    return true;
  } catch (error) {
    console.error("Error guardando reglas de conciliación", error);
    return false;
  }
}

export async function upsertCategoriasGasto(rows: CategoriaGasto[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(categoriasGasto, categoriasGasto.id, rows.map(categoriaGastoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando categorías de gasto", error);
    return false;
  }
}

export async function upsertCategoriasIngreso(rows: CategoriaIngreso[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(categoriasIngreso, categoriasIngreso.id, rows.map(categoriaIngresoToRow));
    return true;
  } catch (error) {
    console.error("Error guardando categorías de ingreso", error);
    return false;
  }
}

export async function upsertEmpresas(rows: Empresa[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(empresas, empresas.id, rows.map(empresaToRow));
    return true;
  } catch (error) {
    console.error("Error guardando empresas", error);
    return false;
  }
}

export async function deleteEmpresas(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(empresas).where(inArray(empresas.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando empresas", error);
    return false;
  }
}

export async function upsertServicios(rows: Servicio[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(servicios, servicios.id, rows.map(servicioToRow));
    return true;
  } catch (error) {
    console.error("Error guardando servicios", error);
    return false;
  }
}

export async function deleteServicios(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(servicios).where(inArray(servicios.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando servicios", error);
    return false;
  }
}

// El horario semanal se maneja como reemplazo completo vía diff (igual que
// clientes/empresas, ver diffPorId en AppContext.tsx): el formulario arma la
// lista deseada completa y acá solo se hace upsert/delete de lo que cambió.
export async function upsertHorariosAgenda(rows: HorarioAgenda[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(horariosAgenda, horariosAgenda.id, rows.map(horarioAgendaToRow));
    return true;
  } catch (error) {
    console.error("Error guardando horarios de agenda", error);
    return false;
  }
}

export async function deleteHorariosAgenda(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(horariosAgenda).where(inArray(horariosAgenda.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando horarios de agenda", error);
    return false;
  }
}

export async function upsertBloqueosAgenda(rows: BloqueoAgenda[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(bloqueosAgenda, bloqueosAgenda.id, rows.map(bloqueoAgendaToRow));
    return true;
  } catch (error) {
    console.error("Error guardando bloqueos de agenda", error);
    return false;
  }
}

export async function deleteBloqueosAgenda(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(bloqueosAgenda).where(inArray(bloqueosAgenda.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando bloqueos de agenda", error);
    return false;
  }
}

/** Estado real en la base de un set de citas, para validar transiciones antes de escribir (ver upsertCitas en @/lib/db). */
export async function getEstadosCitas(ids: string[]): Promise<Map<string, Cita["estado"]>> {
  if (!ids.length) return new Map();
  const rows = await getDb().select({ id: citas.id, estado: citas.estado }).from(citas).where(inArray(citas.id, ids));
  return new Map(rows.map((r) => [r.id, r.estado as Cita["estado"]]));
}

// A diferencia del resto de upsert*, una cita también reemplaza su set de
// servicios ligados (cita_servicios, equivalente a cita_procedimientos en
// ConsultaPro): se borran los vínculos existentes de cada cita tocada y se
// insertan los servicioIds actuales. citaServicios.id es determinístico
// ("citaId:servicioId") para que reintentar el mismo upsert sea idempotente.
export async function upsertCitas(rows: Cita[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    const db = getDb();
    await upsertRows(citas, citas.id, rows.map(citaToRow));
    const citaIds = rows.map((c) => c.id);
    await db.delete(citaServicios).where(inArray(citaServicios.citaId, citaIds));
    const nuevosVinculos = rows.flatMap((c) =>
      c.servicioIds.map((servicioId) => ({ id: `${c.id}:${servicioId}`, citaId: c.id, servicioId }))
    );
    if (nuevosVinculos.length) await db.insert(citaServicios).values(nuevosVinculos);
    return true;
  } catch (error) {
    console.error("Error guardando citas", error);
    return false;
  }
}

export async function deleteCitas(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(citas).where(inArray(citas.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando citas", error);
    return false;
  }
}

// Log de auditoría: de solo escritura (append-only), nunca se actualiza ni
// se borra desde la app. Falla en silencio (solo loguea a consola) para que
// un problema con la auditoría nunca bloquee ni revierta la escritura de
// negocio real que la originó — ver cómo se llama desde commit() en
// AppContext.tsx (después de confirmar que la escritura principal sí ok).
export async function insertAuditoria(entradas: AuditoriaEntrada[]): Promise<boolean> {
  if (!entradas.length) return true;
  try {
    await getDb()
      .insert(auditoria)
      .values(
        entradas.map((e) => ({
          tabla: e.tabla,
          registroId: e.registroId,
          accion: e.accion,
          datosAnteriores: e.datosAnteriores ?? null,
          datosNuevos: e.datosNuevos ?? null,
          usuario: e.usuario,
        }))
      );
    return true;
  } catch (error) {
    console.error("Error guardando auditoría", error);
    return false;
  }
}

const COMPROBANTES_BUCKET = "comprobantes-gastos";

/** Sube el comprobante (boleta/factura escaneada) de un egreso y devuelve su URL pública, o null si falló. */
export async function subirComprobanteGasto(id: string, file: File): Promise<string | null> {
  const path = `${id}-${file.name}`;
  const { error } = await supabase.storage.from(COMPROBANTES_BUCKET).upload(path, file, { upsert: true });
  if (error) {
    console.error("Error subiendo comprobante", error);
    return null;
  }
  const { data } = supabase.storage.from(COMPROBANTES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

const BANNERS_SERVICIOS_BUCKET = "banners-servicios";

/** Sube la imagen de banner de un servicio (Web Settings) y devuelve su URL pública, o null si falló. */
export async function subirBannerServicio(servicioId: string, file: File): Promise<string | null> {
  const path = `${servicioId}-${file.name}`;
  const { error } = await supabase.storage.from(BANNERS_SERVICIOS_BUCKET).upload(path, file, { upsert: true });
  if (error) {
    console.error("Error subiendo banner de servicio", error);
    return null;
  }
  const { data } = supabase.storage.from(BANNERS_SERVICIOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export interface SuscripcionOneclickInfo {
  id: string;
  patente: string;
  clienteNombre: string;
  estado: string;
  proximoCobro: string | null;
  cardTipo: string | null;
  cardUltimosDigitos: string | null;
  ultimoCobro: { estado: string; fecha: string } | null;
}

/** Estado de la suscripción Oneclick de un cliente para mostrar en
 * ClienteInfoModal, o null si nunca inscribió una tarjeta. */
export async function obtenerSuscripcionOneclick(patente: string): Promise<SuscripcionOneclickInfo | null> {
  const db = getDb();
  const [suscripcion] = await db
    .select()
    .from(suscripcionesOneclick)
    .where(eq(suscripcionesOneclick.patente, patente))
    .limit(1);
  if (!suscripcion) return null;

  const [ultimoCobro] = await db
    .select({ estado: cobrosOneclick.estado, fecha: cobrosOneclick.creadoEn })
    .from(cobrosOneclick)
    .where(eq(cobrosOneclick.suscripcionId, suscripcion.id))
    .orderBy(desc(cobrosOneclick.creadoEn))
    .limit(1);

  const [cliente] = await db.select({ nombre: clientes.nombre }).from(clientes).where(eq(clientes.patente, patente)).limit(1);

  return {
    id: suscripcion.id,
    patente: suscripcion.patente,
    clienteNombre: cliente?.nombre || suscripcion.patente,
    estado: suscripcion.estado,
    proximoCobro: suscripcion.proximoCobro,
    cardTipo: suscripcion.cardTipo,
    cardUltimosDigitos: suscripcion.cardUltimosDigitos,
    ultimoCobro: ultimoCobro ? { estado: ultimoCobro.estado, fecha: ultimoCobro.fecha } : null,
  };
}

/** Fila cruda de la suscripción, para pasarle a cobrarSuscripcion() desde el Server Action de reintento manual. */
export async function obtenerSuscripcionOneclickPorId(id: string) {
  const [suscripcion] = await getDb().select().from(suscripcionesOneclick).where(eq(suscripcionesOneclick.id, id)).limit(1);
  return suscripcion || null;
}

const ESTADO_ORDEN: Record<string, number> = { activa: 0, suspendida: 1, pendiente: 2, cancelada: 3 };

/** Todas las suscripciones Oneclick para la pestaña Admin → Suscripciones,
 * con el nombre del cliente (join por patente, ya que suscripcionesOneclick
 * no guarda clienteId — se inscribe antes de que necesariamente exista una
 * fila en clientes) y el último intento de cobro de cada una. */
export async function listarSuscripcionesOneclick(): Promise<SuscripcionOneclickInfo[]> {
  const db = getDb();
  const filas = await db
    .select({ suscripcion: suscripcionesOneclick, clienteNombre: clientes.nombre })
    .from(suscripcionesOneclick)
    .leftJoin(clientes, eq(clientes.patente, suscripcionesOneclick.patente))
    .orderBy(desc(suscripcionesOneclick.creadoEn));

  const ultimosCobros = await db
    .select({ suscripcionId: cobrosOneclick.suscripcionId, estado: cobrosOneclick.estado, fecha: cobrosOneclick.creadoEn })
    .from(cobrosOneclick)
    .orderBy(desc(cobrosOneclick.creadoEn));
  const ultimoPorSuscripcion = new Map<string, { estado: string; fecha: string }>();
  for (const c of ultimosCobros) {
    if (!ultimoPorSuscripcion.has(c.suscripcionId)) ultimoPorSuscripcion.set(c.suscripcionId, { estado: c.estado, fecha: c.fecha });
  }

  return filas
    .map(({ suscripcion, clienteNombre }) => ({
      id: suscripcion.id,
      patente: suscripcion.patente,
      clienteNombre: clienteNombre || suscripcion.patente,
      estado: suscripcion.estado,
      proximoCobro: suscripcion.proximoCobro,
      cardTipo: suscripcion.cardTipo,
      cardUltimosDigitos: suscripcion.cardUltimosDigitos,
      ultimoCobro: ultimoPorSuscripcion.get(suscripcion.id) || null,
    }))
    .sort((a, b) => (ESTADO_ORDEN[a.estado] ?? 9) - (ESTADO_ORDEN[b.estado] ?? 9));
}

/** Cancela una suscripción: da de baja la tarjeta en Transbank (si alcanzó a
 * quedar "activa" alguna vez) y marca el estado localmente. Es terminal — a
 * diferencia de suspenderSuscripcionOneclick, no se puede reactivar después
 * porque el token de tarjeta ya no existe en Transbank. */
export async function cancelarSuscripcionOneclick(id: string): Promise<boolean> {
  const db = getDb();
  const suscripcion = await obtenerSuscripcionOneclickPorId(id);
  if (!suscripcion) return false;

  if (suscripcion.tbkUser) {
    try {
      await oneclickInscription().delete(suscripcion.tbkUser, suscripcion.username);
    } catch (error) {
      // Best-effort: si Transbank falla (ej. ya estaba dada de baja), igual
      // se cancela localmente — lo que importa es que el cron deje de
      // cobrarla. Mismo criterio que cobrarSuscripcion() en pagos.ts: nunca
      // perder el estado local por un error downstream.
      console.error("Error dando de baja tarjeta Oneclick en Transbank", id, error);
    }
  }

  await db
    .update(suscripcionesOneclick)
    .set({ estado: "cancelada", actualizadoEn: new Date().toISOString() })
    .where(eq(suscripcionesOneclick.id, id));
  return true;
}

/** Pausa los cobros futuros sin dar de baja la tarjeta en Transbank, para
 * poder reactivarla después con reactivarSuscripcionOneclick(). El cron
 * (/api/pagos/oneclick/cobrar) solo cobra estado "activa", así que
 * "suspendida" queda excluida automáticamente sin más cambios. */
export async function suspenderSuscripcionOneclick(id: string): Promise<boolean> {
  const db = getDb();
  await db
    .update(suscripcionesOneclick)
    .set({ estado: "suspendida", actualizadoEn: new Date().toISOString() })
    .where(eq(suscripcionesOneclick.id, id));
  return true;
}

/** Vuelve a activar una suscripción "suspendida" (no recalcula proximoCobro:
 * si quedó vencido, el cron del día siguiente cobra normalmente, igual que
 * cualquier otra suscripción activa atrasada). */
export async function reactivarSuscripcionOneclick(id: string): Promise<boolean> {
  const db = getDb();
  await db
    .update(suscripcionesOneclick)
    .set({ estado: "activa", actualizadoEn: new Date().toISOString() })
    .where(eq(suscripcionesOneclick.id, id));
  return true;
}
