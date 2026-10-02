// Programa de referidos: un cliente comparte zplash.cl/?ref=SUPATENTE, el
// amigo saca el descuento de bienvenida por el pop-up de la landing y su cupón
// queda con nombreLote "Referido - SUPATENTE". Cuando el amigo lo usa (mesón o
// web, da igual: los dos lo marcan `usado`), el cron /api/referidos/premiar le
// emite a quien invitó un cupón "Premio referido - CODIGODELAMIGO". Ese nombre
// es la marca de idempotencia: un cupón de amigo premia una sola vez.
//
// Quién invitó a quién vive en nombreLote a propósito: sin columnas nuevas en
// cupones, y los lotes ya se filtran por nombre en B2B/Dsctos. Monto y
// vigencia (del cupón del amigo y del premio): Configuración → Programa de
// referidos.

const PREFIJO_REFERIDO = "Referido - ";
const PREFIJO_PREMIO = "Premio referido - ";

/** Plantilla del WhatsApp "te ganaste tu premio" que manda /api/referidos/premiar. */
export const PLANTILLA_WHATSAPP_PREMIO_REFERIDO = "wa-premio-referido";

export function loteReferido(patenteReferidor: string): string {
  return PREFIJO_REFERIDO + patenteReferidor;
}

export function lotePremioReferido(codigoAmigo: string): string {
  return PREFIJO_PREMIO + codigoAmigo;
}

/** Premios por emitir: un cupón de amigo usado cuyo premio todavía no existe.
 * ponytail: sin tope por referidor — si aparecen abusos (una persona
 * inscribiendo patentes ajenas), contar premios por patente en el mes y cortar. */
export function premiosPendientes(
  cuponesAmigoUsados: { codigo: string; nombreLote: string }[],
  lotesPremioExistentes: Set<string>
): { patenteReferidor: string; codigoAmigo: string; nombreLote: string }[] {
  return cuponesAmigoUsados
    .filter((c) => c.nombreLote.startsWith(PREFIJO_REFERIDO))
    .map((c) => ({
      patenteReferidor: c.nombreLote.slice(PREFIJO_REFERIDO.length),
      codigoAmigo: c.codigo,
      nombreLote: lotePremioReferido(c.codigo),
    }))
    .filter((p) => p.patenteReferidor && !lotesPremioExistentes.has(p.nombreLote));
}
