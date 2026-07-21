import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { cobrosOneclick, pagosWebpay, pagosWebpayItems, ventas } from "@/db/schema";
import type { Venta } from "@/types";
import { upsertRows } from "./shared";

type VentaRow = typeof ventas.$inferSelect;

export function ventaToRow(v: Venta): typeof ventas.$inferInsert {
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

export function ventaFromRow(r: VentaRow): Venta {
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
