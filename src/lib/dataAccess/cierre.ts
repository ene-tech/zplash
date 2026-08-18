import "server-only";

import { inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { cierresCaja, ingresos, movimientosContables, ventas } from "@/db/schema";
import { diaCaja, soloCambiosSinPlata } from "@/lib/helpers";
import type { CierreCaja, MovimientoContable, Venta } from "@/types";
import { movimientoFromRow } from "./contabilidad";
import { safe } from "./shared";
import { ventasPorIds } from "./ventas";

type CierreRow = typeof cierresCaja.$inferSelect;

export function cierreCajaFromRow(r: CierreRow): CierreCaja {
  return {
    fecha: r.fecha,
    cerradoPor: r.cerradoPor,
    cerradoEn: r.cerradoEn,
    resumen: r.resumen,
    notas: r.notas || undefined,
  };
}

/** Alta del cierre de un día. Sin update ni delete a propósito: `fecha` es la
 * PK, así que cerrar dos veces el mismo día falla acá (devuelve false) en vez
 * de duplicar o pisar el cierre original — la carrera la resuelve la base. */
export async function insertCierreCaja(cierre: CierreCaja): Promise<boolean> {
  try {
    await getDb().insert(cierresCaja).values({
      fecha: cierre.fecha,
      cerradoPor: cierre.cerradoPor,
      cerradoEn: cierre.cerradoEn,
      resumen: cierre.resumen,
      notas: cierre.notas || null,
    });
    return true;
  } catch (error) {
    console.error("Error guardando el cierre de caja", error);
    return false;
  }
}

// --- Guards de "día ya cerrado" -------------------------------------------
//
// Viven en dataAccess y NO en dataAccess/ventas|ingresos|contabilidad: los
// llaman los Server Actions (@/lib/serverActions), es decir el camino por el
// que escribe la UI. Los callers server-to-server que entran directo a
// dataAccess (webhook de Webpay/Oneclick/WooCommerce, cron de Oneclick) NO
// pasan por acá a propósito: si llega un pago real con fecha de un día ya
// cerrado, perderlo sería peor que descuadrar el resumen de ese día.

/** Días (YYYY-MM-DD, hora de Chile) ya cerrados. Se lee la tabla entera: es
 * una fila por día de operación, no crece como ventas/ingresos.
 *
 * Vía `safe`: si la consulta falla (típicamente esta migración todavía sin
 * aplicar en la base), cae a "ningún día cerrado" y las escrituras siguen
 * pasando. Al revés —tumbar cada venta/ingreso porque el guard no pudo
 * leer— dejaría el túnel sin poder registrar nada; mismo criterio que el
 * bloqueo horario de insertIngresos ante un getConfig() caído. */
export async function diasCerrados(): Promise<Set<string>> {
  const filas = await safe(getDb().select({ fecha: cierresCaja.fecha }).from(cierresCaja));
  return new Set(filas.map((f) => f.fecha));
}

/** true si alguna de esas fechas cae en un día ya cerrado — el guard de las
 * altas (una venta/ingreso nuevo con fecha de un día congelado). */
export async function altaEnDiaCerrado(fechas: (string | null | undefined)[]): Promise<boolean> {
  if (!fechas.length) return false;
  const cerrados = await diasCerrados();
  return cerrados.size > 0 && fechas.some((f) => !!f && cerrados.has(diaCaja(f)));
}

async function fechasDeFilas(tabla: PgTable, idCol: PgColumn, fechaCol: PgColumn, ids: string[]): Promise<string[]> {
  const filas = await getDb().select({ fecha: fechaCol }).from(tabla).where(inArray(idCol, ids));
  return filas.map((f) => String(f.fecha));
}

/** Guard de las bajas: el id por sí solo no dice de qué día es la fila, así
 * que hay que ir a buscar su fecha guardada antes de dejar borrar. */
export async function bajaEnDiaCerrado(tabla: "ventas" | "ingresos" | "movimientos", ids: string[]): Promise<boolean> {
  if (!ids.length) return false;
  const cerrados = await diasCerrados();
  if (!cerrados.size) return false;
  const fechas =
    tabla === "ventas"
      ? await fechasDeFilas(ventas, ventas.id, ventas.fecha, ids)
      : tabla === "ingresos"
        ? await fechasDeFilas(ingresos, ingresos.id, ingresos.fecha, ids)
        : await fechasDeFilas(movimientosContables, movimientosContables.id, movimientosContables.fecha, ids);
  return fechas.some((f) => cerrados.has(diaCaja(f)));
}

/** Guard de las ediciones: se rechaza solo si el upsert cambia algo que mueve
 * plata en un día cerrado (ver soloCambiosSinPlata) — marcar una factura como
 * emitida o canjear un lavado web prepagado siguen permitidos. */
async function edicionBloqueada<T extends { id: string; fecha: string }>(
  rows: T[],
  buscarPrevias: (ids: string[]) => Promise<T[]>
): Promise<boolean> {
  if (!rows.length) return false;
  const cerrados = await diasCerrados();
  if (!cerrados.size) return false;
  const enCerrado = rows.filter((r) => cerrados.has(diaCaja(r.fecha)));
  if (!enCerrado.length) return false;
  const previas = new Map((await buscarPrevias(enCerrado.map((r) => r.id))).map((p) => [p.id, p]));
  return enCerrado.some((r) => !soloCambiosSinPlata(previas.get(r.id), r));
}

export async function edicionVentasEnDiaCerrado(rows: Venta[]): Promise<boolean> {
  return edicionBloqueada(rows, ventasPorIds);
}

export async function edicionMovimientosEnDiaCerrado(rows: MovimientoContable[]): Promise<boolean> {
  return edicionBloqueada(rows, async (ids) =>
    (await getDb().select().from(movimientosContables).where(inArray(movimientosContables.id, ids))).map(movimientoFromRow)
  );
}
