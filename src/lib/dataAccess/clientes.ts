import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import type { Cliente } from "@/types";
import { upsertRows } from "./shared";

type ClienteRow = typeof clientes.$inferSelect;

export function clienteToRow(c: Cliente): typeof clientes.$inferInsert {
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

export function clienteFromRow(r: ClienteRow): Cliente {
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
