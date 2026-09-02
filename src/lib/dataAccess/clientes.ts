import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, politicasAceptadas, suscripcionesOneclick, ventas } from "@/db/schema";
import { POLITICAS_VERSION } from "@/lib/politicas";
import { sigueVigenteHoy, uid } from "@/lib/helpers";
import type { Cliente, ClientePatch } from "@/types";
import { insertAuditoria } from "./auditoria";
import { upsertRows } from "./shared";

export async function getClientesByIds(ids: string[]): Promise<Cliente[]> {
  if (!ids.length) return [];
  const rows = await getDb().select().from(clientes).where(inArray(clientes.id, ids));
  return rows.map(clienteFromRow);
}

// Usado por solicitarCambioPatente (@/lib/serverActions/clientes) para chequear que la
// nueva patente solicitada no choque con la de otro cliente ya existente
// (misma restricción única que protege `patente` al guardar).
export async function buscarClientePorPatente(patente: string): Promise<Cliente | null> {
  const [row] = await getDb().select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
  return row ? clienteFromRow(row) : null;
}

// Usado por el login por OTP del Portal Cliente (@/app/api/cliente/otp):
// clientes.email no es único, así que un mismo correo puede resolver a
// varias filas (varias patentes de una misma persona) — la sesión que arma
// otp/verificar/route.ts cubre todas las que devuelva esta consulta.
// Comparación case-insensitive (mismo criterio que aplicarPagoPackEmpresa)
// porque clientes.email no siempre quedó guardado en minúsculas.
export async function buscarClientesPorEmail(email: string): Promise<Cliente[]> {
  if (!email) return [];
  const rows = await getDb()
    .select()
    .from(clientes)
    .where(sql`lower(${clientes.email}) = ${email.toLowerCase()}`);
  return rows.map(clienteFromRow);
}

type ClienteRow = typeof clientes.$inferSelect;

export function clienteToRow(c: Cliente): typeof clientes.$inferInsert {
  return {
    id: c.id,
    nombre: c.nombre,
    patente: c.patente,
    telefono: c.telefono || null,
    email: c.email || null,
    vehiculo: c.vehiculo || null,
    plan: c.plan || null,
    ilimitadoHasta: c.ilimitadoHasta || null,
    aceptoX5En: c.aceptoX5En || null,
    tipoDocumento: c.tipoDocumento || null,
    razonSocial: c.razonSocial || null,
    rut: c.rut || null,
    direccion: c.direccion || null,
    giro: c.giro || null,
    vencimiento: c.vencimiento || null,
    patentePendiente: c.patentePendiente || null,
    patentePendienteDesde: c.patentePendienteDesde || null,
    fechaContratacion: c.fechaContratacion || null,
    suscripcionCanceladaEn: c.suscripcionCanceladaEn || null,
    renovacionAutoWooDesde: c.renovacionAutoWooDesde || null,
    precioPlanHeredado: c.precioPlanHeredado ?? null,
    origen: c.origen || "LOCAL",
    visitas: c.visitas || 0,
    ultimaVisita: c.ultimaVisita || null,
    ultimaRenovacion: c.ultimaRenovacion || null,
    creadoEn: c.creadoEn,
    creadoPor: c.creadoPor || null,
  };
}

export function clienteFromRow(r: ClienteRow): Cliente {
  return {
    id: r.id,
    nombre: r.nombre,
    patente: r.patente,
    telefono: r.telefono || undefined,
    email: r.email || undefined,
    vehiculo: r.vehiculo || undefined,
    plan: r.plan || undefined,
    ilimitadoHasta: r.ilimitadoHasta || null,
    aceptoX5En: r.aceptoX5En || null,
    tipoDocumento: (r.tipoDocumento as Cliente["tipoDocumento"]) || undefined,
    razonSocial: r.razonSocial || undefined,
    rut: r.rut || undefined,
    direccion: r.direccion || undefined,
    giro: r.giro || undefined,
    vencimiento: r.vencimiento || null,
    patentePendiente: r.patentePendiente || undefined,
    patentePendienteDesde: r.patentePendienteDesde || undefined,
    fechaContratacion: r.fechaContratacion || null,
    suscripcionCanceladaEn: r.suscripcionCanceladaEn || null,
    renovacionAutoWooDesde: r.renovacionAutoWooDesde || null,
    precioPlanHeredado: r.precioPlanHeredado ?? null,
    origen: (r.origen as Cliente["origen"]) || "LOCAL",
    visitas: r.visitas || 0,
    ultimaVisita: r.ultimaVisita || undefined,
    ultimaRenovacion: r.ultimaRenovacion || undefined,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

// `nuevos` son altas: se insertan completas, igual que antes. `actualizaciones`
// son ediciones de filas que ya existen en la base: se escriben campo por
// campo (solo las columnas presentes en `patch`), no la fila completa — así
// una sesión con una copia desactualizada del cliente nunca pisa en la base
// un campo que ella nunca tocó (ver memoria del caso HERNAN, 2026-07-27, y el
// comentario de patchDeCliente en @/lib/helpers/clientes).
export async function upsertClientes(
  nuevos: Cliente[],
  actualizaciones: { anterior: Cliente; patch: ClientePatch }[] = []
): Promise<boolean> {
  let ok = true;

  if (nuevos.length) {
    try {
      await upsertRows(clientes, clientes.id, nuevos.map(clienteToRow));
    } catch (error) {
      // El upsert en lote (un solo INSERT ... ON CONFLICT(id) para todas las
      // filas) falla completo si UNA sola fila choca con la restricción única
      // de `patente` — por ejemplo, otro admin registró esa patente después de
      // que este navegador cargó sus datos (la carga masiva por Excel detecta
      // duplicados contra la copia en memoria, no contra la base), o dos filas
      // del mismo Excel normalizan a la misma patente. Sin este fallback, se
      // perdían en pantalla TODOS los clientes del lote — incluidos los
      // legítimos — hasta recargar la página, sin indicar cuál fue el
      // problema. Acá se reintenta fila por fila para aislar solo la(s)
      // fila(s) realmente conflictivas y no perder el resto.
      console.error("Error guardando clientes nuevos en lote, reintentando fila por fila", error);
      for (const row of nuevos) {
        try {
          await upsertRows(clientes, clientes.id, [clienteToRow(row)]);
        } catch (errorFila) {
          ok = false;
          console.error("No se pudo guardar el cliente (probable choque de patente con otro id)", row.id, row.patente, errorFila);
        }
      }
    }
  }

  for (const { anterior, patch } of actualizaciones) {
    const set = columnasDelPatch(anterior, patch);
    if (!Object.keys(set).length) continue; // patch sin campos reales (solo id): nada que escribir
    try {
      await getDb().update(clientes).set(set).where(eq(clientes.id, patch.id));
    } catch (error) {
      ok = false;
      console.error("No se pudo actualizar el cliente", patch.id, error);
    }
  }

  return ok;
}

// Arma el SET de un UPDATE parcial: reutiliza clienteToRow (mismas
// normalizaciones falsy→null que un guardado completo) sobre la fila
// mezclada, pero solo toma de ahí las columnas que el patch realmente trae —
// el resto de `anterior` está ahí únicamente para que esas normalizaciones
// tengan de dónde leer, no para reescribirse.
function columnasDelPatch(anterior: Cliente, patch: ClientePatch): Record<string, unknown> {
  const fila = clienteToRow({ ...anterior, ...patch } as Cliente) as Record<string, unknown>;
  const set: Record<string, unknown> = {};
  for (const campo of Object.keys(patch)) {
    if (campo === "id") continue;
    set[campo] = fila[campo];
  }
  return set;
}

export async function deleteClientes(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(clientes).where(inArray(clientes.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando clientes", error);
    return false;
  }
}

/**
 * Borra el email de un cliente cuando quedó demostrado que no se le puede
 * escribir (dirección malformada o rechazada de plano por el proveedor, ver
 * ejecutarAccionReglaCorreo). Con el campo vacío, la ficha del operador pasa
 * sola a mostrar el input "Correo electrónico" con su botón Guardar (ver
 * OperadorFoundResult), así que el próximo lavado de ese cliente es la
 * oportunidad de pedirle la dirección buena.
 *
 * La dirección vieja no se pierde: queda en `correos_automaticos.para` (la
 * bandeja de salida, con el correo que se intentó mandar) y en la auditoría
 * que escribe esta misma función — útil porque muchas son la dirección
 * correcta con un error tipográfico obvio, y el operador puede confirmarla en
 * vez de pedirla desde cero.
 */
export async function limpiarEmailCliente(id: string, emailAnterior: string, motivo: string): Promise<boolean> {
  try {
    await getDb().update(clientes).set({ email: null }).where(eq(clientes.id, id));
  } catch (error) {
    console.error("Error borrando el email inválido del cliente", id, error);
    return false;
  }
  // Después de la escritura real y sin await bloqueante sobre su resultado:
  // insertAuditoria ya falla en silencio a propósito (ver su comentario).
  await insertAuditoria([
    {
      tabla: "clientes",
      registroId: id,
      accion: "update",
      datosAnteriores: { email: emailAnterior },
      datosNuevos: { email: null, motivo },
      usuario: "correo-automatico",
    },
  ]);
  return true;
}

// Update puntual (no pasa por el upsert en lote de arriba) para la solicitud
// de cambio de patente diferido — ver solicitarCambioPatente/
// cancelarCambioPatente en @/lib/serverActions/clientes. `patentePendiente: null` limpia
// también la fecha de solicitud (no tiene sentido guardarla sin una patente
// pendiente asociada).
/**
 * Deja registrado que este cliente aceptó pasar del ilimitado viejo al X5, y
 * con eso desbloquea el cobro (ver requiereValidacionX5).
 *
 * Reactiva de paso la suscripción Oneclick que el propio candado había pausado
 * (ver cobrarSuscripcion): el cliente aceptó, así que su renovación automática
 * vuelve a correr sola en el próximo ciclo. Solo toca las pausadas por esta
 * razón — una cancelada por el cliente o una pendiente de inscripción se
 * quedan como están.
 *
 * No pisa una aceptación anterior: `isNull` deja la fecha del primer sí, que es
 * la que sirve como prueba de cuándo consintió.
 */
export async function registrarAceptacionX5(id: string): Promise<boolean> {
  try {
    const db = getDb();
    const [cliente] = await db.select({ patente: clientes.patente }).from(clientes).where(eq(clientes.id, id)).limit(1);
    if (!cliente) return false;
    await db
      .update(clientes)
      .set({ aceptoX5En: new Date().toISOString() })
      .where(and(eq(clientes.id, id), isNull(clientes.aceptoX5En)));
    await db
      .update(suscripcionesOneclick)
      .set({ estado: "activa", actualizadoEn: new Date().toISOString() })
      .where(and(eq(suscripcionesOneclick.patente, cliente.patente), eq(suscripcionesOneclick.estado, "pausada_validacion_x5")));
    return true;
  } catch (error) {
    console.error("Error registrando la aceptación del paso al X5", id, error);
    return false;
  }
}

export async function actualizarPatentePendiente(id: string, patentePendiente: string | null): Promise<boolean> {
  try {
    await getDb()
      .update(clientes)
      .set({
        patentePendiente,
        patentePendienteDesde: patentePendiente ? new Date().toISOString() : null,
      })
      .where(eq(clientes.id, id));
    return true;
  } catch (error) {
    console.error("Error actualizando patente pendiente del cliente", id, error);
    return false;
  }
}

/** ¿Esta cuenta ya aceptó la versión vigente de las políticas? Ver
 * politicasAceptadas en @/db/schema/clientes. */
export async function aceptoPoliticas(email: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ email: politicasAceptadas.email })
    .from(politicasAceptadas)
    .where(and(eq(politicasAceptadas.email, email.toLowerCase()), eq(politicasAceptadas.version, POLITICAS_VERSION)))
    .limit(1);
  return !!row;
}

/** Idempotente: volver a aceptar la misma versión no mueve la fecha original,
 * que es justamente el dato que hay que poder mostrar si alguien reclama. */
export async function registrarAceptacionPoliticas(email: string): Promise<void> {
  await getDb()
    .insert(politicasAceptadas)
    .values({ email: email.toLowerCase(), version: POLITICAS_VERSION })
    .onConflictDoNothing();
}

// Mismo texto para el rechazo por dueño activo en los dos caminos (Mi Cuenta
// y registro nuevo), para no describir la misma regla de dos formas.
export const PATENTE_CON_DUENO_MSG =
  "Esa patente ya está registrada. Si es tuya, contáctanos para vincularla a tu cuenta.";

// Vincula una patente a la cuenta de `email`: la crea de cero (sin plan, igual
// que un alta por WhatsApp — ver nuevoCliente en @/lib/whatsapp/router.ts) si
// no existe todavía, o reclama la fila existente si está huérfana. Con dueño
// activo se rechaza: dejar que cualquiera la sume a su cuenta filtraría su
// historial de compras y su tarjeta guardada a quien solo conoce la patente
// (visible en el auto).
//
// Lo usan los dos caminos por los que un correo se queda con una patente:
// "Agregar vehículo" desde Mi Cuenta (con sesión) y el registro de un cliente
// nuevo desde el login (ver /api/cliente/otp/verificar), que crea su primera
// ficha recién después de verificar el código.
//
// El chequeo de "¿está huérfana?" y la escritura que la reclama corren dentro
// de una sola transacción con un advisory lock por patente (mismo mecanismo
// que cobrarSuscripcion/cobrarOfertaOneclick en @/lib/pagos): sin esto, dos
// cuentas que reclaman la misma patente huérfana casi al mismo tiempo pasaban
// el chequeo antes de que cualquiera terminara de escribir, y las dos
// terminaban con `crearSesionCliente` firmando una cookie válida por 30 días
// sobre el mismo vehículo. El caso de patente nueva (sin fila existente)
// también queda serializado acá: la segunda llamada concurrente espera el
// lock, ve la fila que la primera ya insertó y cae al mismo camino de "ya está
// registrada" en vez de arriesgar el choque de la restricción única de
// `clientes.patente`.
export async function vincularPatenteACuenta(
  patente: string,
  nombre: string,
  email: string,
  creadoPor: string
): Promise<{ ok: true; clienteId: string } | { ok: false; error: string }> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${patente}))`);

    const [existenteRow] = await tx.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
    const existente = existenteRow ? clienteFromRow(existenteRow) : null;

    // Sin correo vinculado y sin plan vigente: a primera vista nadie tiene esta
    // ficha controlada hoy (p.ej. un alta por WhatsApp que nunca tuvo cuenta, o
    // un vehículo que su dueño anterior sacó de su cuenta con "Quitar de mi
    // cuenta", que solo limpia el email — ver quitar-vehiculo/route.ts). Pero
    // "Quitar de mi cuenta" deja la tarjeta Oneclick intacta a propósito (sigue
    // cobrándose sola), así que sin este chequeo cualquiera que solo conociera
    // la patente podía reclamar la ficha y luego cobrar la tarjeta guardada del
    // dueño anterior vía /cobrar-oferta (cobrarOfertaOneclick busca la
    // suscripción solo por patente) — y de paso heredar su historial de compras
    // (ver `compras` en /api/cliente/mi-cuenta). Por eso además de "sin dueño
    // activo" se exige que no quede ninguna tarjeta viva ni venta asociada:
    // si hay algo de eso, se cae al mismo camino de "contáctanos" que un dueño
    // activo, aunque el email/plan ya no lo delate.
    let huerfana = !!existente && !existente.email && !sigueVigenteHoy(existente.vencimiento);
    if (huerfana && existente) {
      const [tarjetaViva] = await tx
        .select({ id: suscripcionesOneclick.id })
        .from(suscripcionesOneclick)
        .where(and(eq(suscripcionesOneclick.patente, patente), inArray(suscripcionesOneclick.estado, ["activa", "suspendida"])))
        .limit(1);
      const [ventaPrevia] = await tx.select({ id: ventas.id }).from(ventas).where(eq(ventas.clienteId, existente.id)).limit(1);
      huerfana = !tarjetaViva && !ventaPrevia;
    }
    if (existente && !huerfana) {
      return { ok: false as const, error: PATENTE_CON_DUENO_MSG };
    }

    if (existente) {
      await tx.update(clientes).set({ nombre, email, creadoPor }).where(eq(clientes.id, existente.id));
      return { ok: true as const, clienteId: existente.id };
    }

    const clienteId = uid();
    await tx.insert(clientes).values({
      id: clienteId,
      nombre,
      patente,
      email,
      plan: "",
      vencimiento: null,
      origen: "LOCAL",
      visitas: 0,
      creadoEn: new Date().toISOString(),
      creadoPor,
    });
    return { ok: true as const, clienteId };
  });
}
