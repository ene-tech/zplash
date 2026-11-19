import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { cupones } from "@/db/schema";
import { cuponFromRow } from "@/lib/dataAccess/cupones";
import { cuponDescuentoDePatente } from "@/lib/helpers";
import type { Cupon } from "@/types";

/**
 * Cupón de descuento vigente de esta patente, para rebajar el precio de un
 * plan cobrado por web (Webpay Plus u Oneclick). Es el equivalente servidor de
 * lo que el mesón resuelve en memoria sobre `data.cupones` — el criterio de
 * "cuál corresponde" vive una sola vez, en cuponDescuentoDePatente
 * (@/lib/helpers/cupones), para que los cuatro caminos de cobro no puedan
 * discrepar.
 */
export async function buscarCuponDescuentoPlan(patente: string, db: DbOrTx = getDb(), paraPlanX3 = false): Promise<Cupon | undefined> {
  return (await buscarCuponesDescuentoPlan(patente, db))[paraPlanX3 ? "planX3" : "general"];
}

/**
 * Los dos cupones que puede usar esta patente en un cobro web, con una sola
 * consulta: `general` (todo menos el Plan X3) y `planX3` (el primer cobro del
 * X3, que además acepta el descuento del primer mes del X3, ver
 * esCuponSoloX3). Para las pantallas que anuncian los dos precios a la vez.
 */
export async function buscarCuponesDescuentoPlan(
  patente: string,
  db: DbOrTx = getDb()
): Promise<{ general: Cupon | undefined; planX3: Cupon | undefined }> {
  const filas = await db
    .select()
    .from(cupones)
    .where(and(eq(cupones.patenteAsignada, patente), eq(cupones.tipo, "descuento"), eq(cupones.usado, false)));
  const lista = filas.map(cuponFromRow);
  const ahora = new Date();
  return {
    general: cuponDescuentoDePatente(lista, patente, "web", ahora),
    planX3: cuponDescuentoDePatente(lista, patente, "web", ahora, true),
  };
}

/**
 * Marca el cupón como usado. El `usado = false` del WHERE lo hace idempotente:
 * un doble callback de Transbank (o un reintento del cron) no vuelve a
 * escribir la fecha de uso, y el `false` que devuelve avisa que alguien más ya
 * lo había consumido — quien llama decide si eso amerita un log, pero nunca
 * revertir el pago, que a esa altura Transbank ya cobró.
 *
 * Va SIEMPRE en la misma transacción que aplica el pago (por eso recibe `db`):
 * si la venta se cae a mitad de camino, el cupón tiene que quedar sin quemar.
 */
export async function consumirCupon(codigo: string, patente: string, operador: string, db: DbOrTx = getDb()): Promise<boolean> {
  const filas = await db
    .update(cupones)
    .set({ usado: true, patenteUso: patente, fechaUso: new Date().toISOString(), operadorUso: operador })
    .where(and(eq(cupones.codigo, codigo), eq(cupones.usado, false)))
    .returning({ id: cupones.id });
  return filas.length > 0;
}
