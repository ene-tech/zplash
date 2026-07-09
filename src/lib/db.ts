import { supabase } from "@/lib/supabase";
import { ADMINISTRADORES_DEFAULT, CATEGORIAS_GASTO_DEFAULT, OPERADORES_DEFAULT, PRECIOS_DEFAULT } from "@/lib/helpers";
import type {
  AdministradorPublico,
  AppData,
  CategoriaGasto,
  Cliente,
  Cupon,
  Ingreso,
  MovimientoContable,
  Operador,
  Precios,
  Venta,
} from "@/types";

type Row = Record<string, unknown>;

function clienteToRow(c: Cliente): Row {
  return {
    id: c.id,
    nombre: c.nombre,
    patente: c.patente,
    telefono: c.telefono || null,
    email: c.email || null,
    vehiculo: c.vehiculo || null,
    plan: c.plan || null,
    tipo_documento: c.tipoDocumento || null,
    razon_social: c.razonSocial || null,
    rut: c.rut || null,
    direccion: c.direccion || null,
    giro: c.giro || null,
    vencimiento: c.vencimiento || null,
    fecha_contratacion: c.fechaContratacion || null,
    origen: c.origen || "LOCAL",
    visitas: c.visitas || 0,
    ultima_visita: c.ultimaVisita || null,
    ultima_renovacion: c.ultimaRenovacion || null,
    creado_en: c.creadoEn,
    creado_por: c.creadoPor || null,
  };
}

function clienteFromRow(r: Row): Cliente {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    patente: r.patente as string,
    telefono: (r.telefono as string) || undefined,
    email: (r.email as string) || undefined,
    vehiculo: (r.vehiculo as string) || undefined,
    plan: (r.plan as string) || undefined,
    tipoDocumento: (r.tipo_documento as Cliente["tipoDocumento"]) || undefined,
    razonSocial: (r.razon_social as string) || undefined,
    rut: (r.rut as string) || undefined,
    direccion: (r.direccion as string) || undefined,
    giro: (r.giro as string) || undefined,
    vencimiento: (r.vencimiento as string) || null,
    fechaContratacion: (r.fecha_contratacion as string) || null,
    origen: (r.origen as Cliente["origen"]) || "LOCAL",
    visitas: (r.visitas as number) || 0,
    ultimaVisita: (r.ultima_visita as string) || undefined,
    ultimaRenovacion: (r.ultima_renovacion as string) || undefined,
    creadoEn: r.creado_en as string,
    creadoPor: (r.creado_por as string) || undefined,
  };
}

function ingresoToRow(i: Ingreso): Row {
  return {
    id: i.id,
    cliente_id: i.clienteId,
    patente: i.patente,
    nombre: i.nombre,
    fecha: i.fecha,
    plan_estado_al_ingreso: i.planEstadoAlIngreso,
    operador: i.operador || null,
    es_garantia: i.esGarantia || false,
    via_cupon: i.viaCupon || false,
    cupon_codigo: i.cuponCodigo || null,
  };
}

function ingresoFromRow(r: Row): Ingreso {
  return {
    id: r.id as string,
    clienteId: (r.cliente_id as string) || "",
    patente: r.patente as string,
    nombre: r.nombre as string,
    fecha: r.fecha as string,
    planEstadoAlIngreso: r.plan_estado_al_ingreso as Ingreso["planEstadoAlIngreso"],
    operador: (r.operador as string) || undefined,
    esGarantia: (r.es_garantia as boolean) || undefined,
    viaCupon: (r.via_cupon as boolean) || undefined,
    cuponCodigo: (r.cupon_codigo as string) || undefined,
  };
}

function ventaToRow(v: Venta): Row {
  return {
    id: v.id,
    cliente_id: v.clienteId,
    patente: v.patente,
    nombre: v.nombre,
    plan: v.plan || "",
    precio: v.precio || 0,
    tipo: v.tipo,
    fecha: v.fecha,
    operador: v.operador || null,
    metodo_pago: v.metodoPago || null,
    voucher: v.voucher || null,
    hora_entrega: v.horaEntrega || null,
    notas: v.notas || null,
    estado_pago: v.estadoPago || null,
    monto_cobrado: v.montoCobrado ?? null,
    es_servicio_adicional: v.esServicioAdicional || false,
    tipo_documento: v.tipoDocumento || null,
    razon_social: v.razonSocial || null,
    rut: v.rut || null,
    direccion: v.direccion || null,
    giro: v.giro || null,
  };
}

function ventaFromRow(r: Row): Venta {
  return {
    id: r.id as string,
    clienteId: (r.cliente_id as string) || "",
    patente: r.patente as string,
    nombre: r.nombre as string,
    plan: (r.plan as string) || "",
    precio: (r.precio as number) || 0,
    tipo: r.tipo as string,
    fecha: r.fecha as string,
    operador: (r.operador as string) || undefined,
    metodoPago: (r.metodo_pago as Venta["metodoPago"]) || undefined,
    voucher: (r.voucher as string) || undefined,
    horaEntrega: (r.hora_entrega as string) || undefined,
    notas: (r.notas as string) || undefined,
    estadoPago: (r.estado_pago as Venta["estadoPago"]) || undefined,
    montoCobrado: r.monto_cobrado === null || r.monto_cobrado === undefined ? undefined : (r.monto_cobrado as number),
    esServicioAdicional: (r.es_servicio_adicional as boolean) || undefined,
    tipoDocumento: (r.tipo_documento as Venta["tipoDocumento"]) || undefined,
    razonSocial: (r.razon_social as string) || undefined,
    rut: (r.rut as string) || undefined,
    direccion: (r.direccion as string) || undefined,
    giro: (r.giro as string) || undefined,
  };
}

function operadorToRow(o: Operador): Row {
  return { id: o.id, nombre: o.nombre, clave: o.clave };
}

function operadorFromRow(r: Row): Operador {
  return { id: r.id as string, nombre: r.nombre as string, clave: r.clave as string };
}

// No hay un administradorToRow/upsert: la tabla administradores ya no acepta
// escrituras del cliente (ver /api/admin/cambiar-clave). Esto solo lee la
// vista pública (sin la columna clave).
function administradorPublicoFromRow(r: Row): AdministradorPublico {
  return {
    id: r.id as string,
    nombre: r.nombre as AdministradorPublico["nombre"],
    esGerente: (r.es_gerente as boolean) || undefined,
  };
}

function categoriaGastoToRow(c: CategoriaGasto): Row {
  return { id: c.id, nombre: c.nombre, grupo: c.grupo, activa: c.activa };
}

function categoriaGastoFromRow(r: Row): CategoriaGasto {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    grupo: r.grupo as string,
    activa: (r.activa as boolean) ?? true,
  };
}

function cuponToRow(c: Cupon): Row {
  return {
    id: c.id,
    codigo: c.codigo,
    nombre_lote: c.nombreLote,
    valor: c.valor || 0,
    numero_lote: c.numeroLote || 1,
    total_lote: c.totalLote || 1,
    fecha_caducidad: c.fechaCaducidad,
    usado: c.usado || false,
    patente_uso: c.patenteUso || null,
    fecha_uso: c.fechaUso || null,
    operador_uso: c.operadorUso || null,
    creado_en: c.creadoEn,
    creado_por: c.creadoPor || null,
  };
}

function cuponFromRow(r: Row): Cupon {
  return {
    id: r.id as string,
    codigo: r.codigo as string,
    nombreLote: r.nombre_lote as string,
    valor: (r.valor as number) || 0,
    numeroLote: (r.numero_lote as number) || 1,
    totalLote: (r.total_lote as number) || 1,
    fechaCaducidad: r.fecha_caducidad as string,
    usado: (r.usado as boolean) || false,
    patenteUso: (r.patente_uso as string) || undefined,
    fechaUso: (r.fecha_uso as string) || undefined,
    operadorUso: (r.operador_uso as string) || undefined,
    creadoEn: r.creado_en as string,
    creadoPor: (r.creado_por as string) || undefined,
  };
}

function movimientoToRow(m: MovimientoContable): Row {
  return {
    id: m.id,
    tipo: m.tipo,
    fecha: m.fecha,
    descripcion: m.descripcion,
    categoria: m.categoria || null,
    contraparte: m.contraparte || null,
    rut_proveedor: m.rutProveedor || null,
    numero_factura: m.numeroFactura || null,
    tipo_documento: m.tipoDocumento || null,
    documento_url: m.documentoUrl || null,
    documento_nombre: m.documentoNombre || null,
    monto: m.monto || 0,
    estado: m.estado,
    notas: m.notas || null,
    creado_en: m.creadoEn,
    creado_por: m.creadoPor || null,
  };
}

function movimientoFromRow(r: Row): MovimientoContable {
  return {
    id: r.id as string,
    tipo: r.tipo as MovimientoContable["tipo"],
    fecha: r.fecha as string,
    descripcion: r.descripcion as string,
    categoria: (r.categoria as string) || undefined,
    contraparte: (r.contraparte as string) || undefined,
    rutProveedor: (r.rut_proveedor as string) || undefined,
    numeroFactura: (r.numero_factura as string) || undefined,
    tipoDocumento: (r.tipo_documento as MovimientoContable["tipoDocumento"]) || undefined,
    documentoUrl: (r.documento_url as string) || undefined,
    documentoNombre: (r.documento_nombre as string) || undefined,
    monto: (r.monto as number) || 0,
    estado: (r.estado as MovimientoContable["estado"]) || "pendiente",
    notas: (r.notas as string) || undefined,
    creadoEn: r.creado_en as string,
    creadoPor: (r.creado_por as string) || undefined,
  };
}

function preciosFromRows(rows: Row[]): Precios {
  const precios: Precios = {};
  for (const r of rows) {
    precios[r.plan as string] = { normal: (r.normal as number) || 0, promo: (r.promo as number) || 0 };
  }
  return precios;
}

export async function waitForStorage(): Promise<boolean> {
  const { error } = await supabase.from("config").select("id").limit(1);
  if (error) console.error("No se pudo conectar a Supabase", error);
  return !error;
}

export async function loadAll(): Promise<AppData> {
  const [
    clientesRes,
    ingresosRes,
    ventasRes,
    operadoresRes,
    administradoresRes,
    preciosRes,
    configRes,
    cuponesRes,
    movimientosRes,
    categoriasGastoRes,
  ] = await Promise.all([
    supabase.from("clientes").select("*"),
    supabase.from("ingresos").select("*").order("fecha", { ascending: false }),
    supabase.from("ventas").select("*").order("fecha", { ascending: false }),
    supabase.from("operadores").select("*"),
    supabase.from("administradores_publicos").select("*"),
    supabase.from("precios").select("*"),
    supabase.from("config").select("*").maybeSingle(),
    supabase.from("cupones").select("*").order("creado_en", { ascending: false }),
    supabase.from("movimientos_contables").select("*").order("fecha", { ascending: false }),
    supabase.from("categorias_gasto").select("*").order("nombre", { ascending: true }),
  ]);

  for (const res of [
    clientesRes,
    ingresosRes,
    ventasRes,
    operadoresRes,
    administradoresRes,
    preciosRes,
    configRes,
    cuponesRes,
    movimientosRes,
    categoriasGastoRes,
  ]) {
    if (res.error) console.error("Error cargando datos de Supabase", res.error);
  }

  const operadores = operadoresRes.data?.length ? operadoresRes.data.map(operadorFromRow) : OPERADORES_DEFAULT;
  const administradores = administradoresRes.data?.length
    ? administradoresRes.data.map(administradorPublicoFromRow)
    : ADMINISTRADORES_DEFAULT;
  const precios = preciosRes.data?.length ? preciosFromRows(preciosRes.data) : PRECIOS_DEFAULT;
  const categoriasGasto = categoriasGastoRes.data?.length
    ? categoriasGastoRes.data.map(categoriaGastoFromRow)
    : CATEGORIAS_GASTO_DEFAULT;

  return {
    clientes: (clientesRes.data || []).map(clienteFromRow),
    ingresos: (ingresosRes.data || []).map(ingresoFromRow),
    ventas: (ventasRes.data || []).map(ventaFromRow),
    operadores,
    administradores,
    precios,
    categoriasGasto,
    pinAdmin: (configRes.data?.pin_admin as string) || "1234",
    cupones: (cuponesRes.data || []).map(cuponFromRow),
    movimientosContables: (movimientosRes.data || []).map(movimientoFromRow),
  };
}

export async function upsertClientes(rows: Cliente[]): Promise<boolean> {
  if (!rows.length) return true;
  const { error } = await supabase.from("clientes").upsert(rows.map(clienteToRow));
  if (error) console.error("Error guardando clientes", error);
  return !error;
}

export async function deleteClientes(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  const { error } = await supabase.from("clientes").delete().in("id", ids);
  if (error) console.error("Error eliminando clientes", error);
  return !error;
}

export async function insertIngresos(rows: Ingreso[]): Promise<boolean> {
  if (!rows.length) return true;
  const { error } = await supabase.from("ingresos").insert(rows.map(ingresoToRow));
  if (error) console.error("Error guardando ingresos", error);
  return !error;
}

export async function insertVentas(rows: Venta[]): Promise<boolean> {
  if (!rows.length) return true;
  const { error } = await supabase.from("ventas").insert(rows.map(ventaToRow));
  if (error) console.error("Error guardando ventas", error);
  return !error;
}

export async function upsertOperadores(rows: Operador[]): Promise<boolean> {
  if (!rows.length) return true;
  const { error } = await supabase.from("operadores").upsert(rows.map(operadorToRow));
  if (error) console.error("Error guardando operadores", error);
  return !error;
}

export async function deleteOperadores(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  const { error } = await supabase.from("operadores").delete().in("id", ids);
  if (error) console.error("Error eliminando operadores", error);
  return !error;
}

export async function upsertPrecios(precios: Precios): Promise<boolean> {
  const rows = Object.entries(precios).map(([plan, v]) => ({ plan, normal: v.normal, promo: v.promo }));
  if (!rows.length) return true;
  const { error } = await supabase.from("precios").upsert(rows);
  if (error) console.error("Error guardando precios", error);
  return !error;
}

export async function setPinAdmin(pin: string): Promise<boolean> {
  const { error } = await supabase.from("config").update({ pin_admin: pin }).eq("id", true);
  if (error) console.error("Error guardando PIN", error);
  return !error;
}

export async function upsertCupones(rows: Cupon[]): Promise<boolean> {
  if (!rows.length) return true;
  const { error } = await supabase.from("cupones").upsert(rows.map(cuponToRow));
  if (error) console.error("Error guardando cupones", error);
  return !error;
}

export async function deleteCupones(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  const { error } = await supabase.from("cupones").delete().in("id", ids);
  if (error) console.error("Error eliminando cupones", error);
  return !error;
}

export async function upsertMovimientosContables(rows: MovimientoContable[]): Promise<boolean> {
  if (!rows.length) return true;
  const { error } = await supabase.from("movimientos_contables").upsert(rows.map(movimientoToRow));
  if (error) console.error("Error guardando movimientos contables", error);
  return !error;
}

export async function deleteMovimientosContables(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  const { error } = await supabase.from("movimientos_contables").delete().in("id", ids);
  if (error) console.error("Error eliminando movimientos contables", error);
  return !error;
}

export async function upsertCategoriasGasto(rows: CategoriaGasto[]): Promise<boolean> {
  if (!rows.length) return true;
  const { error } = await supabase.from("categorias_gasto").upsert(rows.map(categoriaGastoToRow));
  if (error) console.error("Error guardando categorías de gasto", error);
  return !error;
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
