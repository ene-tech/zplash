import "server-only";

import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { cobrosOneclick, pagosWebpay, pagosWebpayItems, ventas } from "@/db/schema";
import { MINUTOS_BLOQUEO_PLAN_DUPLICADO, TIPOS_VENTA_PLAN, esVentaAutomatica } from "@/lib/helpers";
import { evaluarReglasCorreoPorVenta } from "@/lib/mailing/reglas";
import { evaluarReglasPorVenta } from "@/lib/whatsapp/reglas";
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
    facturaEmitida: v.facturaEmitida || false,
    canjeadaEn: v.canjeadaEn || null,
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
    facturaEmitida: r.facturaEmitida || undefined,
    canjeadaEn: r.canjeadaEn || undefined,
  };
}

export async function ventasPorIds(ids: string[]): Promise<Venta[]> {
  if (!ids.length) return [];
  return (await getDb().select().from(ventas).where(inArray(ventas.id, ids))).map(ventaFromRow);
}

/** true si el upsert intenta reclasificar una venta que registró sola la
 * plataforma (ver esVentaAutomatica en @/lib/helpers): cambiarle el tipo, el
 * medio de pago o el monto a un cobro Webpay/Oneclick/WooCommerce, o a un lote
 * de Venta Empresa. Ninguna de esas cosas puede ser la corrección de un error
 * humano —nadie tipeó esa venta—, así que el bloqueo vive acá, en la base, y
 * no depende de qué pantalla escriba. Lo que sí se sigue actualizando en una
 * venta web:
 * facturaEmitida y canjeadaEn. `creadoPor` entra en la comparación para que no
 * se pueda "blanquear" una venta automática antes de reclasificarla, y siempre
 * se compara contra la fila guardada, nunca contra lo que manda el cliente. */
export async function reclasificaVentaAutomatica(rows: Venta[]): Promise<boolean> {
  const previas = new Map((await ventasPorIds(rows.map((r) => r.id))).map((v) => [v.id, v]));
  return rows.some((r) => {
    const previa = previas.get(r.id);
    if (!previa || !esVentaAutomatica(previa)) return false;
    return (
      r.tipo !== previa.tipo || r.metodoPago !== previa.metodoPago || r.precio !== previa.precio || r.creadoPor !== previa.creadoPor
    );
  });
}

/**
 * true si alguna de las filas nuevas es una venta de plan TIPEADA POR UNA
 * PERSONA para un cliente que ya tiene otra venta de plan guardada dentro de
 * la ventana (ver MINUTOS_BLOQUEO_PLAN_DUPLICADO en @/lib/helpers).
 *
 * Es el backstop del bloqueo que usePlanActions ya hace en pantalla: ese mira
 * el `data.ventas` del navegador, así que no ve la venta que acaba de hacer
 * OTRO operador en otra máquina — que es exactamente como pasó con JPBX89
 * (jul-2026: dos "Plan nuevo" con 4 minutos de diferencia, uno de Verónica y
 * otro de Cristian). Este mira la base, así que cubre las dos.
 *
 * Solo bloquea lo manual, a propósito: rechazar acá un cobro que Transbank ya
 * procesó (Webpay, Oneclick, webhook de WooCommerce — ver esVentaAutomatica)
 * dejaría la plata cobrada al cliente y sin venta registrada, que es peor que
 * el duplicado que se quiere evitar.
 */
export async function duplicaVentaPlanReciente(rows: Venta[]): Promise<boolean> {
  const manuales = rows.filter((v) => v.clienteId && TIPOS_VENTA_PLAN.has(v.tipo) && !esVentaAutomatica(v));
  if (!manuales.length) return false;
  const tiposPlan = [...TIPOS_VENTA_PLAN];
  for (const v of manuales) {
    const hasta = new Date(v.fecha);
    const desde = new Date(hasta.getTime() - MINUTOS_BLOQUEO_PLAN_DUPLICADO * 60_000);
    const [previa] = await getDb()
      .select({ id: ventas.id })
      .from(ventas)
      .where(
        and(
          // ne() sobre el propio id: un reintento del mismo commit manda la
          // misma fila, y sin esto se bloquearía a sí mismo.
          ne(ventas.id, v.id),
          eq(ventas.clienteId, v.clienteId),
          inArray(ventas.tipo, tiposPlan),
          gte(ventas.fecha, desde.toISOString()),
          lte(ventas.fecha, hasta.toISOString())
        )
      )
      .limit(1);
    if (previa) return true;
  }
  return false;
}

export async function insertVentas(rows: Venta[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await getDb().insert(ventas).values(rows.map(ventaToRow));
    // after() (no un simple fire-and-forget): evalúa reglas de WhatsApp y de
    // correo (ver @/lib/whatsapp/reglas, @/lib/mailing/reglas) sin retrasar
    // la respuesta, pero garantizando que Vercel mantenga la función viva
    // hasta que termine — un `.catch()` sin await se cortaba a medio camino
    // no pocas veces (la función se congelaba apenas se mandaba la
    // respuesta), dejando el disparo pegado en "programado" para siempre.
    // Esto es solo el único choke point de ventas REALMENTE nuevas (a
    // diferencia de upsertVentas, usado para ediciones) y cubre todas las
    // vías (operador, Webpay, Oneclick, B2B) — un error de Meta/WhatsApp o
    // del proveedor de correo acá nunca debe hacer fallar la venta que ya se
    // guardó.
    after(() => evaluarReglasPorVenta(rows).catch((error) => console.error("Error evaluando reglas de WhatsApp por venta", error)));
    after(() => evaluarReglasCorreoPorVenta(rows).catch((error) => console.error("Error evaluando reglas de correo por venta", error)));
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
