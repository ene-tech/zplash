import "server-only";
import { TransactionDetail } from "transbank-sdk";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cobrosOneclick } from "@/db/schema";
import { oneclickChildCommerceCode, oneclickTransaction } from "@/lib/transbank";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Resultado de Transbank para un buyOrder: el detalle de la única transacción
 * hija (la de ZPlash), o null si no se pudo saber. */
type Detalle = { response_code?: number; authorization_code?: string } | null;

/**
 * Reserva el buyOrder como "en_curso" con su PROPIO commit, fuera de la
 * transacción del llamador. Antes la reserva iba dentro de la misma
 * transacción que authorize(): si la función se cortaba (timeout del cron,
 * conexión caída) después de que Transbank aprobó, el rollback borraba todo
 * rastro del cargo y el día siguiente se volvía a cobrar con otro buyOrder.
 * Ahora la fila sobrevive al rollback y reconciliarCobrosEnCurso() la resuelve
 * antes del próximo intento.
 */
export async function reservarCobro(fila: { id: string; suscripcionId: string; cicloYm: string; monto: number }): Promise<void> {
  await getDb()
    .insert(cobrosOneclick)
    .values({ ...fila, estado: "en_curso" });
}

/** Consulta a Transbank cómo quedó un buyOrder. null si la consulta falla
 * (ej. la orden nunca llegó a Transbank). */
async function consultarCobro(buyOrder: string): Promise<Detalle> {
  try {
    const st = await oneclickTransaction().status(buyOrder);
    return st?.details?.[0] ?? null;
  } catch (error) {
    console.error("No se pudo consultar el estado del cobro Oneclick", buyOrder, error);
    return null;
  }
}

/** Lo que ve el cliente/operador cuando Transbank no contestó: el cargo pudo
 * haber salido, así que no se le dice "rechazada" (eso lo invitaba a pagar de
 * nuevo por otra vía) ni sale el aviso de cobro fallido. */
export const MSG_COBRO_SIN_CONFIRMAR =
  "No pudimos confirmar el cobro con el banco. No lo vuelvas a intentar: lo revisamos solos y, si se cobró, el plan queda aplicado.";

/**
 * authorize() que no confunde "no sé" con "rechazado": si la llamada tira
 * (timeout de red, 5xx) el cargo pudo haber salido igual, así que se le
 * pregunta a Transbank por el buyOrder antes de darlo por rechazado. Si
 * tampoco eso responde tira MSG_COBRO_SIN_CONFIRMAR: la transacción del
 * llamador se revierte, pero la reserva (commit propio) queda "en_curso" y
 * reconciliarCobrosEnCurso() la resuelve antes del próximo intento.
 */
export async function autorizarCobro(username: string, tbkUser: string, buyOrder: string, monto: number): Promise<Detalle> {
  try {
    const resultado = await oneclickTransaction().authorize(username, tbkUser, buyOrder, [
      new TransactionDetail(monto, oneclickChildCommerceCode(), buyOrder),
    ]);
    // A diferencia de Webpay Plus, response_code/authorization_code vienen por
    // cada transacción hija dentro de `details[]` (acá siempre hay una sola).
    return resultado.details?.[0] ?? null;
  } catch (error) {
    console.error("Error autorizando cobro Oneclick, consultando estado", buyOrder, error);
    const detalle = await consultarCobro(buyOrder);
    if (!detalle) throw new Error(MSG_COBRO_SIN_CONFIRMAR);
    return detalle;
  }
}

/** Pasado este plazo sin que Transbank conteste por un buyOrder, se da por no
 * cobrado: lo más probable es que la orden nunca le haya llegado, y sin un
 * límite la suscripción quedaría sin cobrar para siempre. */
const PLAZO_CONSULTA_MS = 3 * 24 * 60 * 60 * 1000;

export type CobroRecuperado = { id: string; monto: number; authorizationCode: string | null };

/**
 * Resuelve los cobros que quedaron "en_curso" de un intento anterior que se
 * cortó a mitad de camino. Corre dentro de la transacción y con el advisory
 * lock de la suscripción ya tomado, así que ninguna de estas filas pertenece a
 * un intento vivo: son huérfanas. Las que Transbank rechazó quedan
 * "rechazada"; las que APROBÓ se devuelven sin tocar, para que el llamador las
 * aplique como el pago que son (ver aplicarCobroRecuperado) en vez de volver a
 * cobrar. Si Transbank no contesta, no se cobra de nuevo hasta saber (tira).
 */
export async function reconciliarCobrosEnCurso(tx: Tx, suscripcionId: string): Promise<CobroRecuperado[]> {
  const huerfanos = await tx
    .select({ id: cobrosOneclick.id, creadoEn: cobrosOneclick.creadoEn, monto: cobrosOneclick.monto })
    .from(cobrosOneclick)
    .where(and(eq(cobrosOneclick.suscripcionId, suscripcionId), eq(cobrosOneclick.estado, "en_curso")));
  const recuperados: CobroRecuperado[] = [];
  for (const { id, creadoEn, monto } of huerfanos) {
    const detalle = await consultarCobro(id);
    if (!detalle && Date.now() - new Date(creadoEn).getTime() < PLAZO_CONSULTA_MS) {
      throw new Error("Hay un cobro anterior sin confirmar en Transbank; se reintenta más tarde");
    }
    if (detalle?.response_code === 0) {
      recuperados.push({ id, monto, authorizationCode: detalle.authorization_code || null });
      continue;
    }
    await tx
      .update(cobrosOneclick)
      .set({ estado: "rechazada", responseCode: detalle?.response_code ?? null, authorizationCode: detalle?.authorization_code || null })
      .where(eq(cobrosOneclick.id, id));
  }
  return recuperados;
}
