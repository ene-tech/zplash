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

import { conOrigen } from "@/lib/helpers/utm";

export const PREFIJO_REFERIDO = "Referido - ";
const PREFIJO_PREMIO = "Premio referido - ";

/** Plantilla del WhatsApp "te ganaste tu premio" que manda /api/referidos/premiar. */
export const PLANTILLA_WHATSAPP_PREMIO_REFERIDO = "wa-premio-referido";

/** Plantilla de la invitación a referir que mandan las reglas (lavado único y plan). */
export const PLANTILLA_WHATSAPP_INVITACION_REFERIDOS = "wa-lavado-unico-referidos";

// La campaña masiva "Regala y Gana" (2-oct-2026, ~18:00 Chile) llegó a toda la
// base: hasta el lunes 5-oct 00:00 Chile la invitación de las reglas sale solo
// a clientes NUEVOS (ficha creada después de la campaña). Se apaga sola.
// ponytail: fechas fijas a propósito; borrar esto (y sus dos llamadas en
// @/lib/whatsapp/reglas/disparadores) después del 5-oct.
const CAMPANA_REFERIDOS_EN = new Date("2026-10-02T21:00:00Z");
const PAUSA_REFERIDOS_HASTA = new Date("2026-10-05T03:00:00Z");

export function saltarInvitacionReferidos(
  plantillaWhatsappId: string | undefined,
  clienteCreadoEn: string,
  ahora: Date = new Date()
): boolean {
  return (
    plantillaWhatsappId === PLANTILLA_WHATSAPP_INVITACION_REFERIDOS &&
    ahora < PAUSA_REFERIDOS_HASTA &&
    new Date(clienteCreadoEn) < CAMPANA_REFERIDOS_EN
  );
}

/** Link que comparte el cliente: su código de referido es la patente. */
export function linkReferido(origin: string, patente: string): string {
  return `${origin}/?ref=${encodeURIComponent(patente)}`;
}

/** Texto que el cliente reenvía por WhatsApp (Mi Cuenta y el QR del operador).
 * El link va marcado para PostHog; el que Mi Cuenta muestra y copia, no. */
export function mensajeInvitacionReferido(link: string, valorFormateado: string): string {
  const marcado = conOrigen(link, { source: "whatsapp", medium: "referido", campaign: "referidos" });
  return `Te regalo ${valorFormateado} de descuento en tu próximo lavado en ZPlash: ${marcado}`;
}

export function loteReferido(patenteReferidor: string): string {
  return PREFIJO_REFERIDO + patenteReferidor;
}

export function lotePremioReferido(codigoAmigo: string): string {
  return PREFIJO_PREMIO + codigoAmigo;
}

// Código de referido (oct-2026, reemplaza al "regalo $2.000 del lavado"): una
// hora después de un lavado único pagado, el cliente recibe un código ABIERTO
// (sin patente asignada) para regalárselo a un amigo — lo emite la regla con
// accion "cupon_regalo" (ver ejecutarAccionRegla). Lleva el mismo nombreLote
// "Referido - SUPATENTE" que el link, así que cuando el amigo lo usa el cron
// de premios le paga a quien lo compartió sin saber de dónde vino. El dueño no
// lo puede usar en su auto, y una patente usa un solo descuento de amigo (ver
// rechazoCodigoReferido).

/** Patente que invitó, si el cupón es de amigo (link o código). */
export function referidorDeLote(nombreLote: string): string | null {
  return nombreLote.startsWith(PREFIJO_REFERIDO) ? nombreLote.slice(PREFIJO_REFERIDO.length) || null : null;
}

/** Por qué esta patente no puede usar este cupón de amigo, o null si puede (o
 * si no es de amigo). `cupones` es la tabla cargada (el mesón la tiene entera):
 * la patente que ya recibió o usó otro cupón de amigo no recibe un segundo —
 * misma regla que patenteYaFueReferida para el link. */
export function rechazoCodigoReferido(
  cupon: { id: string; nombreLote: string },
  patente: string,
  cupones: { id: string; nombreLote: string; patenteAsignada?: string | null; patenteUso?: string | null }[]
): string | null {
  const referidor = referidorDeLote(cupon.nombreLote);
  if (!referidor) return null;
  if (referidor === patente) return "Este código es para regalárselo a un amigo, no se usa en el auto que lo recibió";
  const yaReferida = cupones.some(
    (c) => c.id !== cupon.id && c.nombreLote.startsWith(PREFIJO_REFERIDO) && (c.patenteAsignada === patente || c.patenteUso === patente)
  );
  return yaReferida ? "Esta patente ya usó un descuento de amigo" : null;
}

/** Amigos que llegaron con el link o el código de esta patente y cuántos ya
 * lo usaron — los que generaron premio. Un código que nadie tomó todavía
 * (abierto, sin usar) no cuenta como amigo que llegó. */
export function referidosDePatente(
  cupones: { nombreLote: string; usado: boolean; patenteAsignada?: string | null }[],
  patente: string
): { llegaron: number; usaron: number } {
  const lote = loteReferido(patente);
  const suyos = cupones.filter((c) => c.nombreLote === lote && (c.usado || !!c.patenteAsignada));
  return { llegaron: suyos.length, usaron: suyos.filter((c) => c.usado).length };
}

/** Premio de referido acumulado en una patente: la suma de sus premios vigentes
 * sin usar (normalmente uno solo, ver acumularPremio; más de uno solo si
 * vienen de antes de que se sacara el tope). Los absorbidos ya quedaron usados, así que no se cuentan dos veces. */
export function premioAcumulado(
  cupones: { nombreLote: string; valor: number; usado: boolean; fechaCaducidad: string; patenteAsignada?: string | null }[],
  patente: string,
  ahora: Date = new Date()
): number {
  return cupones
    .filter(
      (c) =>
        c.nombreLote.startsWith(PREFIJO_PREMIO) &&
        c.patenteAsignada === patente &&
        !c.usado &&
        new Date(c.fechaCaducidad) > ahora
    )
    .reduce((suma, c) => suma + c.valor, 0);
}

/** Valor del premio nuevo y códigos de los premios previos (vigentes, sin usar,
 * de la misma patente) que absorbe. Un cobro aplica UN cupón (ver
 * cuponDescuentoDePatente), así que el cron junta todos en el nuevo, sin tope
 * (oct-2026, decisión del usuario): se gasta entero en una pasada y lo que
 * supera el precio se pierde — en el mesón el lavado queda en $0; en la web,
 * que no cobra $0, se le pide usarlo en el local (ver /api/pagos/webpay/crear). */
export function acumularPremio(
  valorNuevo: number,
  previos: { codigo: string; valor: number }[]
): { valor: number; absorbidos: string[] } {
  return {
    valor: previos.reduce((suma, p) => suma + p.valor, valorNuevo),
    absorbidos: previos.map((p) => p.codigo),
  };
}

/** Premios por emitir: un cupón de amigo usado cuyo premio todavía no existe.
 * ponytail: sin tope por referidor — si aparecen abusos (una persona
 * inscribiendo patentes ajenas), contar premios por patente en el mes y cortar. */
export function premiosPendientes(
  cuponesAmigoUsados: { codigo: string; nombreLote: string; patenteUso?: string | null }[],
  lotesPremioExistentes: Set<string>
): { patenteReferidor: string; codigoAmigo: string; nombreLote: string }[] {
  return cuponesAmigoUsados
    // El código usado en el mismo auto que lo recibió no premia (no debería
    // pasar: rechazoCodigoReferido lo frena en el cobro).
    .filter((c) => c.nombreLote.startsWith(PREFIJO_REFERIDO) && c.patenteUso !== referidorDeLote(c.nombreLote))
    .map((c) => ({
      patenteReferidor: c.nombreLote.slice(PREFIJO_REFERIDO.length),
      codigoAmigo: c.codigo,
      nombreLote: lotePremioReferido(c.codigo),
    }))
    .filter((p) => p.patenteReferidor && !lotesPremioExistentes.has(p.nombreLote));
}
