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
