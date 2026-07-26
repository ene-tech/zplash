import "server-only";

import { inArray } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { ingresos } from "@/db/schema";
// Import directo al módulo (no al barrel @/lib/whatsapp) para evitar un ciclo
// de imports, mismo motivo que dataAccess/ventas.ts al llamar
// evaluarReglasPorVenta.
import { evaluarReglasPorIngreso } from "@/lib/whatsapp/reglas";
import type { Ingreso } from "@/types";

type IngresoRow = typeof ingresos.$inferSelect;

export function ingresoToRow(i: Ingreso): typeof ingresos.$inferInsert {
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

export function ingresoFromRow(r: IngresoRow): Ingreso {
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

export async function insertIngresos(rows: Ingreso[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await getDb().insert(ingresos).values(rows.map(ingresoToRow));
    // after() (no un simple fire-and-forget): evalúa reglas WhatsApp
    // "ingreso_plan_registrado" (ej. pedir reseña de Google) sin retrasar la
    // respuesta al operador, pero garantizando que Vercel mantenga la función
    // viva hasta que termine — un simple `.catch()` sin await se cortaba a
    // medio camino no pocas veces (la función se congelaba apenas se mandaba
    // la respuesta), dejando el disparo pegado en "programado" para siempre.
    // Un error acá nunca debe tumbar el ingreso que lo originó.
    after(() => evaluarReglasPorIngreso(rows).catch((error) => console.error("Error evaluando reglas de WhatsApp por ingreso", error)));
    return true;
  } catch (error) {
    console.error("Error guardando ingresos", error);
    return false;
  }
}

export async function deleteIngresos(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(ingresos).where(inArray(ingresos.id, ids));
    return true;
  } catch (error) {
    console.error("Error borrando ingresos", error);
    return false;
  }
}
