import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones, politicasAceptadas, suscripcionesOneclick } from "@/db/schema";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { insertAuditoria } from "@/lib/dataAccess/auditoria";
import { ESTADOS_TARJETA_VIVA } from "@/lib/helpers";

// "Mis datos" del portal cliente (web y app): el propio cliente corrige su
// teléfono y su correo. Se aplica a TODAS las fichas de la cuenta (las de la
// sesión más cualquier otra con el mismo correo, igual que eliminarCuenta),
// porque la cuenta es la persona, no la patente.
//
// Cada cambio deja auditoría con usuario "Portal Cliente", que es lo que lee
// CambiosContactoCliente para mostrarle al mesón y al admin quién lo cambió.

const USUARIO = "Portal Cliente";

async function fichasDeLaCuenta(email: string, clienteIds: string[]) {
  const porCorreo = sql`lower(${clientes.email}) = ${email.trim().toLowerCase()}`;
  const filas = await getDb()
    .select({ id: clientes.id })
    .from(clientes)
    .where(clienteIds.length ? or(porCorreo, inArray(clientes.id, clienteIds)) : porCorreo);
  return filas.length ? getClientesByIds(filas.map((f) => f.id)) : [];
}

// Solo las tarjetas vivas: por patente también aparecen suscripciones
// canceladas de un dueño anterior del auto, que no hay que reescribir.
// (cliente_id viene casi siempre null en Oneclick, por eso va por patente.)
function suscripcionesVivasDe(patentes: string[], ids: string[]) {
  return and(
    or(inArray(suscripcionesOneclick.patente, patentes.length ? patentes : [""]), inArray(suscripcionesOneclick.clienteId, ids)),
    inArray(suscripcionesOneclick.estado, ESTADOS_TARJETA_VIVA)
  );
}

export async function cambiarTelefonoCuenta(email: string, clienteIds: string[], telefono: string): Promise<boolean> {
  const fichas = await fichasDeLaCuenta(email, clienteIds);
  if (!fichas.length) return false;
  const ids = fichas.map((c) => c.id);
  const patentes = fichas.map((c) => c.patente).filter((p): p is string => !!p);
  try {
    await getDb().transaction(async (tx) => {
      await tx.update(clientes).set({ telefono }).where(inArray(clientes.id, ids));
      // El aviso de cobro automático sale con el teléfono copiado a la
      // suscripción al inscribir la tarjeta, no con el de la ficha: se
      // actualiza aunque la ficha ya tuviera este número.
      await tx.update(suscripcionesOneclick).set({ telefono }).where(suscripcionesVivasDe(patentes, ids));
    });
  } catch (error) {
    console.error("Mis datos: no se pudo cambiar el teléfono", ids, error);
    return false;
  }
  const cambiadas = fichas.filter((c) => (c.telefono || "") !== telefono);
  await insertAuditoria(
    cambiadas.map((c) => ({
      tabla: "clientes",
      registroId: c.id,
      accion: "update" as const,
      datosAnteriores: { telefono: c.telefono || null },
      datosNuevos: { telefono },
      usuario: USUARIO,
    }))
  );
  return true;
}

/** El correo nuevo ya viene verificado con un código (ver
 * /api/cliente/mi-cuenta/datos-contacto). Además de las fichas mueve lo que
 * cuelga del correo para que la cuenta no "pierda" nada al cambiarlo: los
 * tickets y cupones atados al correo, el correo de los avisos de cobro
 * automático y la aceptación de las políticas. El Libro de comentarios queda
 * bajo el correo viejo (ver schema/libro.ts). */
export async function cambiarEmailCuenta(emailViejo: string, clienteIds: string[], emailNuevo: string): Promise<boolean> {
  const viejo = emailViejo.trim().toLowerCase();
  const nuevo = emailNuevo.trim().toLowerCase();
  if (viejo === nuevo) return true;
  const fichas = await fichasDeLaCuenta(viejo, clienteIds);
  const ids = fichas.map((c) => c.id);
  const patentes = fichas.map((c) => c.patente).filter((p): p is string => !!p);
  try {
    await getDb().transaction(async (tx) => {
      if (ids.length) {
        await tx.update(clientes).set({ email: nuevo }).where(inArray(clientes.id, ids));
        await tx.update(suscripcionesOneclick).set({ email: nuevo }).where(suscripcionesVivasDe(patentes, ids));
      }
      await tx.update(cupones).set({ email: nuevo }).where(sql`lower(${cupones.email}) = ${viejo}`);
      const aceptadas = await tx.select({ version: politicasAceptadas.version }).from(politicasAceptadas).where(eq(politicasAceptadas.email, viejo));
      if (aceptadas.length) {
        await tx
          .insert(politicasAceptadas)
          .values(aceptadas.map((a) => ({ email: nuevo, version: a.version })))
          .onConflictDoNothing();
      }
    });
  } catch (error) {
    console.error("Mis datos: no se pudo cambiar el correo", ids, error);
    return false;
  }
  await insertAuditoria(
    fichas.map((c) => ({
      tabla: "clientes",
      registroId: c.id,
      accion: "update" as const,
      datosAnteriores: { email: c.email || null },
      datosNuevos: { email: nuevo },
      usuario: USUARIO,
    }))
  );
  return true;
}
