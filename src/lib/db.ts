import { supabase } from "@/lib/supabase";
import { OPERADORES_DEFAULT, PRECIOS_DEFAULT } from "@/lib/helpers";
import type { AppData, Cliente, Ingreso, Operador, Precios, Venta } from "@/types";

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
    tipoDocumento: (r.tipo_documento as string) || undefined,
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
  };
}

function operadorToRow(o: Operador): Row {
  return { id: o.id, nombre: o.nombre, clave: o.clave };
}

function operadorFromRow(r: Row): Operador {
  return { id: r.id as string, nombre: r.nombre as string, clave: r.clave as string };
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
  const [clientesRes, ingresosRes, ventasRes, operadoresRes, preciosRes, configRes] = await Promise.all([
    supabase.from("clientes").select("*"),
    supabase.from("ingresos").select("*").order("fecha", { ascending: false }),
    supabase.from("ventas").select("*").order("fecha", { ascending: false }),
    supabase.from("operadores").select("*"),
    supabase.from("precios").select("*"),
    supabase.from("config").select("*").maybeSingle(),
  ]);

  for (const res of [clientesRes, ingresosRes, ventasRes, operadoresRes, preciosRes, configRes]) {
    if (res.error) console.error("Error cargando datos de Supabase", res.error);
  }

  const operadores = operadoresRes.data?.length ? operadoresRes.data.map(operadorFromRow) : OPERADORES_DEFAULT;
  const precios = preciosRes.data?.length ? preciosFromRows(preciosRes.data) : PRECIOS_DEFAULT;

  return {
    clientes: (clientesRes.data || []).map(clienteFromRow),
    ingresos: (ingresosRes.data || []).map(ingresoFromRow),
    ventas: (ventasRes.data || []).map(ventaFromRow),
    operadores,
    precios,
    pinAdmin: (configRes.data?.pin_admin as string) || "1234",
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
