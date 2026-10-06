import type { Cupon } from "@/types";
import { isValidPatente, normPlate } from "@/lib/helpers/validadores";
import { KEYS_PROMOS_LAVADOS } from "@/lib/helpers/precios";

// Gestión del Pack de Tickets 10/+ desde Mi Cuenta (reglas de patente e
// informe de uso). Las reglas viven en cupones.patentesAutorizadas, el mismo
// campo que ya valida el mesón al canjear (patenteAutorizadaParaCupon), así
// que no hay un segundo lugar donde se decida qué patente puede usar qué.

/** Creador de los cupones que emite el retorno de Webpay (aplicarRetornoWebpay). */
const CREADO_POR_WEBPAY = "Automático (Webpay)";

/** Tope de patentes en una regla: una flota grande cabe de sobra, y evita
 * que un pegado accidental de miles de líneas termine en la base. */
export const MAX_PATENTES_REGLA = 200;

/** ¿El dueño puede cambiarle la regla de patente a este ticket? Solo los de un
 * Pack de Tickets comprado por la web (aplicarPagoPackEmpresa): los packs de 2
 * y 5 lavados quedan atados a la patente con que se compraron (son de ese
 * auto), el ticket de reactivación es 1/1 y los lotes del admin no los creó
 * el cliente. */
export function esTicketGestionable(c: Pick<Cupon, "tipo" | "creadoPor" | "nombreLote" | "totalLote">): boolean {
  return (
    c.tipo === "vale" &&
    c.creadoPor === CREADO_POR_WEBPAY &&
    c.totalLote > 1 &&
    !KEYS_PROMOS_LAVADOS.includes(c.nombreLote)
  );
}

/** Id de la compra a la que pertenece el ticket: aplicarPagoPackEmpresa arma
 * cada id como `${item.id}-${i}`. Agrupa por compra y no por nombreLote, que
 * se repite ("Pack Empresa Web" es el default de todas las compras sin nombre). */
export function loteIdDeTicket(id: string): string {
  return id.replace(/-\d+$/, "");
}

/** Normaliza la lista de una regla. [] = abierto a cualquier patente (en la
 * base va null, igual que una compra que se dejó abierta). */
export function normalizarReglaPatentes(
  entrada: unknown
): { ok: true; patentes: string[] } | { ok: false; error: string } {
  if (!Array.isArray(entrada) || entrada.some((p) => typeof p !== "string")) {
    return { ok: false, error: "Lista de patentes inválida" };
  }
  const patentes = (entrada as string[]).map(normPlate).filter((p, i, arr) => p && arr.indexOf(p) === i);
  const invalida = patentes.find((p) => !isValidPatente(p));
  if (invalida) return { ok: false, error: `Patente inválida: ${invalida}. Ej: AB1234 o ABCD12.` };
  if (patentes.length > MAX_PATENTES_REGLA) {
    return { ok: false, error: `Máximo ${MAX_PATENTES_REGLA} patentes por regla` };
  }
  return { ok: true, patentes };
}
