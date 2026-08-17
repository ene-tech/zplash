import type { Cupon } from "@/types";
import { normPlate } from "./validadores";

/** Alfabeto sin 0/O ni 1/I para evitar confusiones al leer o tipear el código. */
const ALFABETO_CUPON = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generarCodigoCupon(existentes: Set<string>): string {
  let codigo: string;
  do {
    codigo = Array.from({ length: 6 }, () => ALFABETO_CUPON[Math.floor(Math.random() * ALFABETO_CUPON.length)]).join("");
  } while (existentes.has(codigo));
  return codigo;
}

/** Valida un código de descuento (tipo "descuento") para una patente dada, antes de aplicarlo a una venta.
 * Si el cupón no tiene patenteAsignada, es "abierto": lo puede usar cualquier patente. */
export function resolverDescuento(
  codigoCrudo: string,
  patente: string,
  cupones: Cupon[]
): { ok: true; cupon: Cupon } | { ok: false; msg: string } {
  const codigo = codigoCrudo.trim().toUpperCase();
  const cupon = cupones.find((c) => c.codigo === codigo);
  if (!cupon) return { ok: false, msg: "Código de descuento no encontrado" };
  if (cupon.tipo !== "descuento") return { ok: false, msg: "Este código no es un descuento válido" };
  if (cupon.usado) return { ok: false, msg: "Este descuento ya fue usado" };
  if (new Date(cupon.fechaCaducidad) < new Date()) return { ok: false, msg: "Este descuento está caducado" };
  if (cupon.patenteAsignada && cupon.patenteAsignada !== patente) {
    return { ok: false, msg: "Este descuento fue asignado a otra patente" };
  }
  return { ok: true, cupon };
}

/** Monto a descontar del precio base: si el cupón es de porcentaje, se calcula sobre precioBase; si no, es el monto fijo.
 * Recibe solo los dos campos que usa (no el Cupon completo) para que también sirva sobre un cupón que aún no
 * existe en BD — ver montoDescuento/montoAPagar en construirVariables (@/lib/whatsapp/reglas/motor). */
export function montoDescuento(cupon: Pick<Cupon, "esPorcentaje" | "valor">, precioBase: number): number {
  return cupon.esPorcentaje ? Math.round((precioBase * cupon.valor) / 100) : cupon.valor;
}

/** true si la patente puede canjear este cupón: los cupones tipo "vale" de un
 * pack empresa pueden traer una lista de patentes autorizadas (la flota para
 * la que se contrató el lote); sin lista (vacía/undefined) el cupón queda
 * abierto, cualquier patente puede canjearlo (comportamiento original). */
export function patenteAutorizadaParaCupon(cupon: Pick<Cupon, "patentesAutorizadas">, patente: string): boolean {
  if (!cupon.patentesAutorizadas || cupon.patentesAutorizadas.length === 0) return true;
  return cupon.patentesAutorizadas.includes(normPlate(patente));
}

/** Regla "un cupón por patente" del lote (packs de cortesía, canjes de un
 * evento publicitario): cada patente puede canjear un solo cupón del lote,
 * para que la promoción llegue a clientes distintos en vez de que un mismo
 * auto la queme entera. Devuelve el cupón del lote que esa patente ya canjeó
 * — quien llama lo usa para mostrarle el código al operador — o undefined si
 * puede canjear.
 *
 * El lote se identifica por `nombreLote` (la misma agrupación que ve el admin
 * en B2B/Tickets, no hay id de lote) y se cruzan solo cupones que también
 * llevan la regla: así dos lotes homónimos sin ella —ej. los "WhatsApp -
 * Primera vez" del bot, que comparten nombre entre todos los clientes— nunca
 * bloquean un canje. Dos lotes con el mismo nombre y ambos con la regla sí
 * cuentan como uno solo, que es lo esperable si se repite la misma promo. */
export function cuponDelLoteUsadoPorPatente(
  cupon: Pick<Cupon, "id" | "nombreLote" | "unCuponPorPatente">,
  patente: string,
  cupones: Cupon[]
): Cupon | undefined {
  if (!cupon.unCuponPorPatente) return undefined;
  const p = normPlate(patente);
  return cupones.find(
    (c) => c.id !== cupon.id && c.unCuponPorPatente && c.nombreLote === cupon.nombreLote && c.usado && normPlate(c.patenteUso || "") === p
  );
}

export type EstadoCupon = { label: string; cls: "ok" | "warn" | "bad" };

/** Estado a mostrar de un cupón: usado, caducado o disponible — compartido
 * entre el panel admin (VentaEmpresaTab) y la consulta pública de tickets por
 * RUT (/api/empresa/tickets), para no duplicar el criterio en ambos lados. */
export function estadoCupon(c: Pick<Cupon, "usado" | "fechaCaducidad">): EstadoCupon {
  if (c.usado) return { label: "Usado", cls: "ok" };
  if (new Date(c.fechaCaducidad) < new Date()) return { label: "Caducado", cls: "bad" };
  return { label: "Disponible", cls: "warn" };
}

/** Separa un texto de patentes por coma, espacio o salto de línea — se usa
 * tanto en la compra web de Packs Empresa como en el generador manual de
 * cupones del admin (B2B/Tickets), para que el cliente/admin pueda pegarlas
 * de un Excel o escribirlas una por línea. */
export function parsearPatentes(texto: string): string[] {
  return texto
    .split(/[\s,;]+/)
    .map((p) => normPlate(p))
    .filter((p, i, arr) => p && arr.indexOf(p) === i);
}
