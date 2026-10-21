import { diaCaja } from "@/lib/helpers/fechas";

// Decisiones puras sobre el historial de cobros Oneclick de una suscripción:
// sin base ni Transbank, para que se puedan probar con tablas. Las usa
// cobrarSuscripcion, y solo en el cron (`sinCliente`): con alguien delante el
// cobro sale cuando lo aprietan.

/** Una fila de cobros_oneclick, lo justo para decidir. */
export type IntentoCobro = {
  id: string;
  estado: string;
  responseCode: number | null;
  creadoEn: string;
  monto: number;
};

/**
 * true si los dos últimos intentos de la suscripción quedaron "rechazada" sin
 * que Transbank contestara nunca por ellos (responseCode null: authorize tiró,
 * la consulta de estado también, y reconciliarCobrosEnCurso los cerró pasado
 * el plazo). `historial` viene del más nuevo al más viejo.
 *
 * Dos seguidos ya no es un corte de red: es una tarjeta con la que Transbank
 * no quiere ni hablar (oct-2026: KTJB16, un en_curso cada 4 días desde el
 * 6-oct). Reservar otra vez solo agrega otro en_curso y otros 3 días de
 * "cobro anterior sin confirmar"; lo que sirve es mandarle al cliente el link
 * de pago.
 */
export function transbankNoContestoDosVeces(historial: IntentoCobro[]): boolean {
  const [ultimo, penultimo] = historial;
  const sinRespuesta = (i?: IntentoCobro) => i?.estado === "rechazada" && i.responseCode === null;
  return sinRespuesta(ultimo) && sinRespuesta(penultimo);
}

/**
 * Los rechazos de la racha actual, del más viejo al más nuevo: los
 * "rechazada" posteriores al último "aprobada" y desde la fecha de cobro
 * vigente (`proximoCobro`). Tras un rechazo esa fecha no se mueve (ver
 * proximoReintentoISO), así que todos los reintentos de un ciclo caen después
 * de ella; y cuando se mueve —el cliente pagó por otra vía y el cron la
 * reagendó al vencimiento, o re-inscribió la tarjeta desde /pagar— los
 * rechazos viejos quedan antes y la racha arranca de cero sin guardar nada.
 */
export function rachaActual(historialNuevoPrimero: IntentoCobro[], proximoCobro: string | null): IntentoCobro[] {
  const desde = proximoCobro ? new Date(proximoCobro).getTime() : -Infinity;
  const racha: IntentoCobro[] = [];
  for (const intento of historialNuevoPrimero) {
    if (intento.estado === "aprobada") break;
    if (intento.estado !== "rechazada") continue;
    if (new Date(intento.creadoEn).getTime() < desde) break;
    racha.push(intento);
  }
  return racha.reverse();
}

/** Días (contados desde el primer rechazo de la racha) en que el cron vuelve
 * a intentar los rechazos "reintentables" (-3, -6 y cualquier código que no
 * tenga regla propia). Pasado el último sin cobro, se corta. */
export const DIAS_REINTENTO = [1, 2, 3, 6, 9, 12, 15, 18, 21];
/** -10: un solo reintento, a los 4 días del rechazo. */
export const DIAS_REINTENTO_CODIGO_10 = 4;

export type DecisionReintento =
  | { accion: "cobrar" }
  /** Hoy no: el próximo intento toca el día `dia` de la racha. */
  | { accion: "esperar"; dia: number }
  /** El cron deja esta racha: se corta el reintento y se manda el link. */
  | { accion: "cortar"; motivo: "sin_respuesta" | "codigo_11" | "codigo_10" | "dia_21" };

const DIA_MS = 24 * 60 * 60 * 1000;
/** Día calendario de Chile como entero, para contar días sin que la hora del
 * cobro (o del server, en UTC) corra el conteo. */
const diaChile = (fecha: string | Date) => Date.parse(diaCaja(new Date(fecha).toISOString()) + "T00:00:00Z") / DIA_MS;

/**
 * Política de reintento del cron tras rechazos, según el código de respuesta
 * de Transbank. `rechazos` es la racha actual (ver rachaActual), del más viejo
 * al más nuevo; los días se cuentan desde el primero.
 *
 *  - -11: no se reintenta, se corta en el acto.
 *  - -10: un solo reintento a los 4 días; si vuelve a fallar, se corta.
 *  - -3, -6 y el resto (también "sin respuesta"): días 1, 2, 3 y después cada
 *    3 hasta el 21; fallado el del día 21 (o cualquiera posterior), se corta.
 *  - Dos seguidos sin respuesta de Transbank: se corta (ver
 *    transbankNoContestoDosVeces).
 *
 * Se llama dos veces por cobro: antes de cobrar, para saber si hoy toca
 * ("cobrar" / "esperar"), y después de un rechazo, con ese rechazo incluido,
 * para saber si hay que cortar ya y mandar el link sin esperar a mañana.
 */
export function proximoReintento({ rechazos, hoy }: { rechazos: IntentoCobro[]; hoy: Date }): DecisionReintento {
  const ultimo = rechazos.at(-1);
  if (!ultimo) return { accion: "cobrar" };
  if (transbankNoContestoDosVeces(rechazos.slice(-2).reverse())) return { accion: "cortar", motivo: "sin_respuesta" };
  if (ultimo.responseCode === -11) return { accion: "cortar", motivo: "codigo_11" };

  const inicio = diaChile(rechazos[0].creadoEn);
  const dia = (fecha: string | Date) => diaChile(fecha) - inicio;

  let siguiente: number | undefined;
  const i10 = rechazos.findIndex((r) => r.responseCode === -10);
  if (i10 >= 0) {
    if (i10 < rechazos.length - 1) return { accion: "cortar", motivo: "codigo_10" };
    siguiente = dia(rechazos[i10].creadoEn) + DIAS_REINTENTO_CODIGO_10;
  } else {
    const diaUltimo = dia(ultimo.creadoEn);
    siguiente = DIAS_REINTENTO.find((d) => d > diaUltimo);
    if (siguiente === undefined) return { accion: "cortar", motivo: "dia_21" };
  }
  return dia(hoy) >= siguiente ? { accion: "cobrar" } : { accion: "esperar", dia: siguiente };
}
