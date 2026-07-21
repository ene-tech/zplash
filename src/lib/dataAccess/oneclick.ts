import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cobrosOneclick, suscripcionesOneclick } from "@/db/schema";
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
 * porque el token de tarjeta ya no existe en Transbank. */
export async function cancelarSuscripcionOneclick(id: string): Promise<boolean> {
  const db = getDb();
  const suscripcion = await obtenerSuscripcionOneclickPorId(id);
  if (!suscripcion) return false;

  if (suscripcion.tbkUser) {
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
