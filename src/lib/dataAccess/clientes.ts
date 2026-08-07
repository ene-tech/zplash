import "server-only";

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import type { Cliente, ClientePatch } from "@/types";
import { upsertRows } from "./shared";

export async function getClientesByIds(ids: string[]): Promise<Cliente[]> {
  if (!ids.length) return [];
  const rows = await getDb().select().from(clientes).where(inArray(clientes.id, ids));
  return rows.map(clienteFromRow);
}

// Usado por solicitarCambioPatente (@/lib/serverActions/clientes) para chequear que la
// nueva patente solicitada no choque con la de otro cliente ya existente
// (misma restricción única que protege `patente` al guardar).
export async function buscarClientePorPatente(patente: string): Promise<Cliente | null> {
  const [row] = await getDb().select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
  return row ? clienteFromRow(row) : null;
}

// Usado por el login por OTP del Portal Cliente (@/app/api/cliente/otp):
// clientes.telefono no es único, así que un mismo teléfono puede resolver a
// varias filas (varias patentes de una misma persona) — la sesión que arma
// otp/verificar/route.ts cubre todas las que devuelva esta consulta.
export async function buscarClientesPorTelefono(telefono: string): Promise<Cliente[]> {
  if (!telefono) return [];
  const rows = await getDb().select().from(clientes).where(eq(clientes.telefono, telefono));
  return rows.map(clienteFromRow);
}

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
    patentePendiente: c.patentePendiente || null,
    patentePendienteDesde: c.patentePendienteDesde || null,
    fechaContratacion: c.fechaContratacion || null,
    suscripcionCanceladaEn: c.suscripcionCanceladaEn || null,
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
    patentePendiente: r.patentePendiente || undefined,
    patentePendienteDesde: r.patentePendienteDesde || undefined,
    fechaContratacion: r.fechaContratacion || null,
    suscripcionCanceladaEn: r.suscripcionCanceladaEn || null,
    origen: (r.origen as Cliente["origen"]) || "LOCAL",
    visitas: r.visitas || 0,
    ultimaVisita: r.ultimaVisita || undefined,
    ultimaRenovacion: r.ultimaRenovacion || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

// `nuevos` son altas: se insertan completas, igual que antes. `actualizaciones`
// son ediciones de filas que ya existen en la base: se escriben campo por
// campo (solo las columnas presentes en `patch`), no la fila completa — así
// una sesión con una copia desactualizada del cliente nunca pisa en la base
// un campo que ella nunca tocó (ver memoria del caso HERNAN, 2026-07-27, y el
// comentario de patchDeCliente en @/lib/helpers/clientes).
export async function upsertClientes(
  nuevos: Cliente[],
  actualizaciones: { anterior: Cliente; patch: ClientePatch }[] = []
): Promise<boolean> {
  let ok = true;

  if (nuevos.length) {
    try {
      await upsertRows(clientes, clientes.id, nuevos.map(clienteToRow));
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
      console.error("Error guardando clientes nuevos en lote, reintentando fila por fila", error);
      for (const row of nuevos) {
        try {
          await upsertRows(clientes, clientes.id, [clienteToRow(row)]);
        } catch (errorFila) {
          ok = false;
          console.error("No se pudo guardar el cliente (probable choque de patente con otro id)", row.id, row.patente, errorFila);
        }
      }
    }
  }

  for (const { anterior, patch } of actualizaciones) {
    const set = columnasDelPatch(anterior, patch);
    if (!Object.keys(set).length) continue; // patch sin campos reales (solo id): nada que escribir
    try {
      await getDb().update(clientes).set(set).where(eq(clientes.id, patch.id));
    } catch (error) {
      ok = false;
      console.error("No se pudo actualizar el cliente", patch.id, error);
    }
  }

  return ok;
}

// Arma el SET de un UPDATE parcial: reutiliza clienteToRow (mismas
// normalizaciones falsy→null que un guardado completo) sobre la fila
// mezclada, pero solo toma de ahí las columnas que el patch realmente trae —
// el resto de `anterior` está ahí únicamente para que esas normalizaciones
// tengan de dónde leer, no para reescribirse.
function columnasDelPatch(anterior: Cliente, patch: ClientePatch): Record<string, unknown> {
  const fila = clienteToRow({ ...anterior, ...patch } as Cliente) as Record<string, unknown>;
  const set: Record<string, unknown> = {};
  for (const campo of Object.keys(patch)) {
    if (campo === "id") continue;
    set[campo] = fila[campo];
  }
  return set;
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

// Update puntual (no pasa por el upsert en lote de arriba) para la solicitud
// de cambio de patente diferido — ver solicitarCambioPatente/
// cancelarCambioPatente en @/lib/serverActions/clientes. `patentePendiente: null` limpia
// también la fecha de solicitud (no tiene sentido guardarla sin una patente
// pendiente asociada).
export async function actualizarPatentePendiente(id: string, patentePendiente: string | null): Promise<boolean> {
  try {
    await getDb()
      .update(clientes)
      .set({
        patentePendiente,
        patentePendienteDesde: patentePendiente ? new Date().toISOString() : null,
      })
      .where(eq(clientes.id, id));
    return true;
  } catch (error) {
    console.error("Error actualizando patente pendiente del cliente", id, error);
    return false;
  }
}
