import "server-only";

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cobrosOneclick, suscripcionesOneclick } from "@/db/schema";
import { tieneTarjetaViva, uid } from "@/lib/helpers";
import { oneclickInscription } from "@/lib/transbank";

export interface SuscripcionOneclickInfo {
  id: string;
  patente: string;
  clienteNombre: string;
  estado: string;
  proximoCobro: string | null;
  cardTipo: string | null;
  cardUltimosDigitos: string | null;
  ultimoCobro: { estado: string; fecha: string } | null;
}

/** Estado de la suscripción Oneclick de un cliente para mostrar en
 * ClienteInfoModal, o null si nunca inscribió una tarjeta. */
export async function obtenerSuscripcionOneclick(patente: string): Promise<SuscripcionOneclickInfo | null> {
  const db = getDb();
  const [suscripcion] = await db
    .select()
    .from(suscripcionesOneclick)
    .where(eq(suscripcionesOneclick.patente, patente))
    .limit(1);
  if (!suscripcion) return null;

  const [ultimoCobro] = await db
    .select({ estado: cobrosOneclick.estado, fecha: cobrosOneclick.creadoEn })
    .from(cobrosOneclick)
    .where(eq(cobrosOneclick.suscripcionId, suscripcion.id))
    .orderBy(desc(cobrosOneclick.creadoEn))
    .limit(1);

  const [cliente] = await db.select({ nombre: clientes.nombre }).from(clientes).where(eq(clientes.patente, patente)).limit(1);

  return {
    id: suscripcion.id,
    patente: suscripcion.patente,
    clienteNombre: cliente?.nombre || suscripcion.patente,
    estado: suscripcion.estado,
    proximoCobro: suscripcion.proximoCobro,
    cardTipo: suscripcion.cardTipo,
    cardUltimosDigitos: suscripcion.cardUltimosDigitos,
    ultimoCobro: ultimoCobro ? { estado: ultimoCobro.estado, fecha: ultimoCobro.fecha } : null,
  };
}

/** Fila cruda de la suscripción, para pasarle a cobrarSuscripcion() desde el Server Action de reintento manual. */
export async function obtenerSuscripcionOneclickPorId(id: string) {
  const [suscripcion] = await getDb().select().from(suscripcionesOneclick).where(eq(suscripcionesOneclick.id, id)).limit(1);
  return suscripcion || null;
}

/** La misma fila cruda pero buscada por patente, para contratar el plan desde
 * Mi Cuenta contra la tarjeta que el cliente ya tiene guardada (ver
 * /api/cliente/mi-cuenta/cobrar-oferta). Devuelve null si no hay una tarjeta
 * cobrable: sin fila, no activa, o sin tbkUser. */
export async function obtenerSuscripcionOneclickCobrablePorPatente(patente: string) {
  const [suscripcion] = await getDb()
    .select()
    .from(suscripcionesOneclick)
    .where(eq(suscripcionesOneclick.patente, patente))
    .limit(1);
  if (!suscripcion || suscripcion.estado !== "activa" || !suscripcion.tbkUser) return null;
  return suscripcion;
}

/**
 * Deja la tarjeta ya inscrita de `patenteOrigen` cobrando también los otros
 * autos de la misma persona, sin volver a pasar por Transbank: copia el par
 * (username, tbkUser) —que es lo que identifica la inscripción— a la fila de
 * cada patente destino. authorize() acepta el mismo tbkUser para cobros
 * distintos, así que cada auto sigue teniendo su propio ciclo (`proximoCobro`
 * con SU vencimiento) y su propio estado; lo único compartido es la tarjeta.
 *
 * Quien llama tiene que haber verificado que las patentes son de la sesión
 * (ver /api/cliente/mi-cuenta/compartir-tarjeta). Nunca pisa un auto que ya
 * tiene tarjeta propia viva: eso es cambiar de medio de pago, y para eso está
 * inscribir de nuevo.
 *
 * Devuelve las patentes que efectivamente quedaron con la tarjeta.
 */
export async function compartirTarjetaOneclick(patenteOrigen: string, patentesDestino: string[]): Promise<string[]> {
  const db = getDb();
  const [origen] = await db.select().from(suscripcionesOneclick).where(eq(suscripcionesOneclick.patente, patenteOrigen)).limit(1);
  if (!origen || origen.estado !== "activa" || !origen.tbkUser) return [];

  const copiadas: string[] = [];
  for (const patente of patentesDestino) {
    if (patente === patenteOrigen) continue;
    const [existente] = await db.select().from(suscripcionesOneclick).where(eq(suscripcionesOneclick.patente, patente)).limit(1);
    if (tieneTarjetaViva(existente?.estado)) continue;

    // Mismo criterio que la rama "solo tarjeta" de /inscripcion/retorno: se
    // agenda el cobro para el vencimiento real del auto, nunca antes (no
    // duplicar lo que ya pagó por otro medio), y sin plan vigente queda
    // guardada sin fecha — el cron solo mira proximoCobro <= ahora.
    const [cliente] = await db.select({ vencimiento: clientes.vencimiento }).from(clientes).where(eq(clientes.patente, patente)).limit(1);
    const proximoCobro = cliente?.vencimiento && new Date(cliente.vencimiento) > new Date() ? cliente.vencimiento : null;
    const tarjeta = {
      username: origen.username,
      tbkUser: origen.tbkUser,
      cardTipo: origen.cardTipo,
      cardUltimosDigitos: origen.cardUltimosDigitos,
      email: origen.email,
      estado: "activa",
      proximoCobro,
      tokenInscripcion: null,
      actualizadoEn: new Date().toISOString(),
    };
    if (existente) {
      await db.update(suscripcionesOneclick).set(tarjeta).where(eq(suscripcionesOneclick.id, existente.id));
    } else {
      await db.insert(suscripcionesOneclick).values({ id: uid(), patente, ...tarjeta });
    }
    copiadas.push(patente);
  }
  return copiadas;
}

const ESTADO_ORDEN: Record<string, number> = { activa: 0, suspendida: 1, pendiente: 2, cancelada: 3 };

/** Todas las suscripciones Oneclick para la pestaña Admin → Suscripciones,
 * con el nombre del cliente (join por patente, ya que suscripcionesOneclick
 * no guarda clienteId — se inscribe antes de que necesariamente exista una
 * fila en clientes) y el último intento de cobro de cada una. */
export async function listarSuscripcionesOneclick(): Promise<SuscripcionOneclickInfo[]> {
  const db = getDb();
  const filas = await db
    .select({ suscripcion: suscripcionesOneclick, clienteNombre: clientes.nombre })
    .from(suscripcionesOneclick)
    .leftJoin(clientes, eq(clientes.patente, suscripcionesOneclick.patente))
    .orderBy(desc(suscripcionesOneclick.creadoEn));

  const ultimosCobros = await db
    .select({ suscripcionId: cobrosOneclick.suscripcionId, estado: cobrosOneclick.estado, fecha: cobrosOneclick.creadoEn })
    .from(cobrosOneclick)
    .orderBy(desc(cobrosOneclick.creadoEn));
  const ultimoPorSuscripcion = new Map<string, { estado: string; fecha: string }>();
  for (const c of ultimosCobros) {
    if (!ultimoPorSuscripcion.has(c.suscripcionId)) ultimoPorSuscripcion.set(c.suscripcionId, { estado: c.estado, fecha: c.fecha });
  }

  return filas
    .map(({ suscripcion, clienteNombre }) => ({
      id: suscripcion.id,
      patente: suscripcion.patente,
      clienteNombre: clienteNombre || suscripcion.patente,
      estado: suscripcion.estado,
      proximoCobro: suscripcion.proximoCobro,
      cardTipo: suscripcion.cardTipo,
      cardUltimosDigitos: suscripcion.cardUltimosDigitos,
      ultimoCobro: ultimoPorSuscripcion.get(suscripcion.id) || null,
    }))
    .sort((a, b) => (ESTADO_ORDEN[a.estado] ?? 9) - (ESTADO_ORDEN[b.estado] ?? 9));
}

/** Cancela una suscripción: da de baja la tarjeta en Transbank (si alcanzó a
 * quedar "activa" alguna vez) y marca el estado localmente. Es terminal — a
 * diferencia de suspenderSuscripcionOneclick, no se puede reactivar después
 * porque el token de tarjeta ya no existe en Transbank.
 *
 * La baja en Transbank es del par (username, tbkUser), o sea de la TARJETA, y
 * desde que una misma tarjeta puede cobrar varias patentes (ver
 * compartirTarjetaOneclick) eso dejaría sin cobro a los otros autos de la
 * persona. Por eso solo se da de baja cuando esta es la última fila viva que
 * la usa; si quedan hermanas, se cancela nada más que localmente. */
export async function cancelarSuscripcionOneclick(id: string): Promise<boolean> {
  const db = getDb();
  const suscripcion = await obtenerSuscripcionOneclickPorId(id);
  if (!suscripcion) return false;

  const hermanasVivas = suscripcion.tbkUser
    ? await db
        .select({ id: suscripcionesOneclick.id })
        .from(suscripcionesOneclick)
        .where(
          and(
            eq(suscripcionesOneclick.tbkUser, suscripcion.tbkUser),
            ne(suscripcionesOneclick.id, id),
            inArray(suscripcionesOneclick.estado, ["activa", "suspendida"])
          )
        )
    : [];

  if (suscripcion.tbkUser && hermanasVivas.length === 0) {
    try {
      await oneclickInscription().delete(suscripcion.tbkUser, suscripcion.username);
    } catch (error) {
      // Best-effort: si Transbank falla (ej. ya estaba dada de baja), igual
      // se cancela localmente — lo que importa es que el cron deje de
      // cobrarla. Mismo criterio que cobrarSuscripcion() en pagos.ts: nunca
      // perder el estado local por un error downstream.
      console.error("Error dando de baja tarjeta Oneclick en Transbank", id, error);
    }
  }

  await db
    .update(suscripcionesOneclick)
    .set({ estado: "cancelada", actualizadoEn: new Date().toISOString() })
    .where(eq(suscripcionesOneclick.id, id));
  return true;
}

/** Pausa los cobros futuros sin dar de baja la tarjeta en Transbank, para
 * poder reactivarla después con reactivarSuscripcionOneclick(). El cron
 * (/api/pagos/oneclick/cobrar) solo cobra estado "activa", así que
 * "suspendida" queda excluida automáticamente sin más cambios. */
export async function suspenderSuscripcionOneclick(id: string): Promise<boolean> {
  const db = getDb();
  await db
    .update(suscripcionesOneclick)
    .set({ estado: "suspendida", actualizadoEn: new Date().toISOString() })
    .where(eq(suscripcionesOneclick.id, id));
  return true;
}

/** Vuelve a activar una suscripción "suspendida" (no recalcula proximoCobro:
 * si quedó vencido, el cron del día siguiente cobra normalmente, igual que
 * cualquier otra suscripción activa atrasada). */
export async function reactivarSuscripcionOneclick(id: string): Promise<boolean> {
  const db = getDb();
  await db
    .update(suscripcionesOneclick)
    .set({ estado: "activa", actualizadoEn: new Date().toISOString() })
    .where(eq(suscripcionesOneclick.id, id));
  return true;
}
