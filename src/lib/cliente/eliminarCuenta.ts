import "server-only";
import { eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones, otpsCliente, pushSubscriptions, suscripcionesOneclick } from "@/db/schema";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { cancelarSuscripcionOneclick } from "@/lib/dataAccess/oneclick";
import { tieneTarjetaViva } from "@/lib/helpers";
import { cortarCobroWooCommerceLegacy } from "@/lib/pagos";

// "Eliminar mi cuenta" del portal cliente (lo exigen Google Play y la App
// Store; ver /privacidad#eliminar-cuenta). Es inmediato, por decisión del
// dueño (17-nov-2026).
//
// No se borran las filas de `clientes`: ventas.clienteId va con onDelete
// cascade y la ley obliga a conservar ventas y boletas. Se borra lo personal
// (correo, nombre, teléfono, datos de factura) y la patente queda como un
// vehículo sin dueño, igual que el que nunca se registró en la web.
//
// Orden: primero la tarjeta. Si Transbank no la da de baja, no se borra nada:
// una cuenta borrada con un cobro automático vivo sería un cliente al que le
// seguimos cobrando sin forma de entrar a cortarlo.

export type ResultadoEliminarCuenta =
  | { ok: true; patentes: string[]; wooSinCortar: string[] }
  | { ok: false; error: string };

export async function eliminarCuentaCliente(email: string, clienteIds: string[]): Promise<ResultadoEliminarCuenta> {
  const db = getDb();
  const correo = email.trim().toLowerCase();
  const porCorreo = sql`lower(${clientes.email}) = ${correo}`;
  // Las de la sesión más cualquier otra ficha con este correo (ej. una patente
  // que el mesón le asoció después de que inició sesión).
  const fichas = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(clienteIds.length ? or(porCorreo, inArray(clientes.id, clienteIds)) : porCorreo);
  const ids = fichas.map((f) => f.id);
  const cuenta = ids.length ? await getClientesByIds(ids) : [];
  const patentes = cuenta.map((c) => c.patente).filter((p): p is string => !!p);

  const suscripciones = patentes.length
    ? await db
        .select({ id: suscripcionesOneclick.id, estado: suscripcionesOneclick.estado })
        .from(suscripcionesOneclick)
        .where(or(inArray(suscripcionesOneclick.patente, patentes), inArray(suscripcionesOneclick.clienteId, ids)))
    : [];
  for (const s of suscripciones.filter((x) => tieneTarjetaViva(x.estado))) {
    let cancelada = false;
    try {
      cancelada = await cancelarSuscripcionOneclick(s.id, `cliente:${correo} (eliminó su cuenta)`);
    } catch (error) {
      console.error("Eliminar cuenta: no se pudo dar de baja la tarjeta", s.id, error);
    }
    if (!cancelada) {
      return { ok: false, error: "No pudimos dar de baja tu tarjeta guardada. No eliminamos nada: intenta de nuevo en unos minutos." };
    }
  }

  // WooCommerce (renovación del sistema anterior): si falla no se frena el
  // borrado —la tarjeta de Oneclick ya está dada de baja—, pero queda en el
  // correo a ZPlash para cortarla a mano.
  const wooSinCortar: string[] = [];
  for (const c of cuenta.filter((x) => x.renovacionAutoWooDesde && x.patente)) {
    const r = await cortarCobroWooCommerceLegacy(c, c.patente!, "el cliente eliminó su cuenta");
    if (r === "error") wooSinCortar.push(c.patente!);
  }

  await db.transaction(async (tx) => {
    if (ids.length) {
      await tx
        .update(clientes)
        .set({
          email: null,
          nombre: "Cuenta eliminada",
          telefono: null,
          tipoDocumento: null,
          razonSocial: null,
          rut: null,
          direccion: null,
          giro: null,
          sinComunicacionAuto: true,
        })
        .where(inArray(clientes.id, ids));
      await tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.clienteId, ids));
    }
    if (patentes.length) {
      await tx
        .update(suscripcionesOneclick)
        .set({ email: "", telefono: null })
        .where(or(inArray(suscripcionesOneclick.patente, patentes), inArray(suscripcionesOneclick.clienteId, ids)));
    }
    // Tickets y cupones comprados con este correo siguen valiendo (por código
    // o por patente), pero sin quedar atados a la persona.
    await tx.update(cupones).set({ email: null }).where(sql`lower(${cupones.email}) = ${correo}`);
    await tx.delete(otpsCliente).where(eq(otpsCliente.email, correo));
  });

  return { ok: true, patentes, wooSinCortar };
}
