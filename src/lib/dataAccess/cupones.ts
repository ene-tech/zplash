import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { cupones } from "@/db/schema";
import type { Cupon } from "@/types";
import { generarCodigoCupon, uid } from "@/lib/helpers";
import { upsertRows } from "./shared";

type CuponRow = typeof cupones.$inferSelect;

export function cuponToRow(c: Cupon): typeof cupones.$inferInsert {
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
    unCuponPorPatente: c.unCuponPorPatente || false,
    unUsoPorPatente: c.unUsoPorPatente || false,
    patentesUsadas: c.patentesUsadas?.length ? c.patentesUsadas : null,
    soloClientesNuevos: c.soloClientesNuevos || false,
    email: c.email || null,
  };
}

export function cuponFromRow(r: CuponRow): Cupon {
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
    unCuponPorPatente: r.unCuponPorPatente || false,
    unUsoPorPatente: r.unUsoPorPatente || false,
    patentesUsadas: r.patentesUsadas?.length ? r.patentesUsadas : undefined,
    soloClientesNuevos: r.soloClientesNuevos || false,
    email: r.email || undefined,
  };
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

/** Emite (o reutiliza) el cupón "descuento" de bienvenida atado a una patente.
 *
 * Si esa patente ya tiene un descuento pendiente y vigente lo devuelve tal
 * cual en vez de emitir otro: pasar dos veces por el flujo —o una vez por
 * cada canal, el bot de WhatsApp y el pop-up de la landing— no puede
 * multiplicar descuentos. La búsqueda es a propósito por patente y no por
 * lote: son la misma promoción de primera vez, solo cambia por dónde entró.
 *
 * `nombreLote`/`creadoPor` son lo único que distingue el canal, para poder
 * separarlos después en B2B/Tickets. Vive acá y no en @/lib/whatsapp/router
 * (donde nació) justo porque ya la usan los dos canales. */
export async function emitirCuponDescuentoPrimeraVez(opts: {
  patente: string;
  valor: number;
  diasValidez: number;
  nombreLote: string;
  creadoPor: string;
}): Promise<Cupon> {
  const db = getDb();
  const ahora = new Date();
  const [pendiente] = await db
    .select()
    .from(cupones)
    .where(and(eq(cupones.patenteAsignada, opts.patente), eq(cupones.tipo, "descuento"), eq(cupones.usado, false)))
    .limit(1);
  if (pendiente && new Date(pendiente.fechaCaducidad) > ahora) {
    return cuponFromRow(pendiente);
  }

  const existentesRows = await db.select({ codigo: cupones.codigo }).from(cupones);
  const codigo = generarCodigoCupon(new Set(existentesRows.map((r) => r.codigo)));

  const nuevo: Cupon = {
    id: uid(),
    codigo,
    nombreLote: opts.nombreLote,
    valor: opts.valor,
    numeroLote: 1,
    totalLote: 1,
    fechaCaducidad: new Date(ahora.getTime() + opts.diasValidez * 86400000).toISOString(),
    usado: false,
    creadoEn: ahora.toISOString(),
    creadoPor: opts.creadoPor,
    tipo: "descuento",
    patenteAsignada: opts.patente,
  };
  await upsertCupones([nuevo]);
  return nuevo;
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
