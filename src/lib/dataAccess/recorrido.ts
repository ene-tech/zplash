import "server-only";

import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  cobrosOneclick,
  conversacionesWhatsapp,
  correosAutomaticos,
  disparosReglaCorreo,
  disparosReglaWhatsapp,
  mensajesWhatsapp,
  suscripcionesOneclick,
} from "@/db/schema";
import { interesDeMensajes } from "@/lib/helpers/whatsapp";
import type { ComunicacionPeriodo, ComunicacionesCliente, ConteoDisparos, ConversacionSinFicha } from "@/lib/helpers/recorrido";

/**
 * Todas las comunicaciones del período, sin contenido: solo de quién, por qué
 * canal, para qué lado y cuándo. El embudo las agrupa por la etapa en la que
 * estaba el cliente ese día (ver construirEmbudo), y eso necesita la fecha de
 * cada mensaje, no un total ya sumado en SQL.
 */
export async function listarComunicacionesPeriodo(desdeISO: string, hastaISO: string): Promise<ComunicacionPeriodo[]> {
  const db = getDb();

  const [correos, whatsapp] = await Promise.all([
    db
      .select({ clienteId: correosAutomaticos.clienteId, fecha: correosAutomaticos.creadoEn })
      .from(correosAutomaticos)
      // Los que vienen sin cliente_id se traen igual y los descarta
      // resolverComunicaciones, junto con el WhatsApp de números sin ficha:
      // así el embudo puede decir cuántos mensajes quedaron sin atribuir en
      // vez de que desaparezcan callados en el WHERE.
      .where(and(gte(correosAutomaticos.creadoEn, desdeISO), lte(correosAutomaticos.creadoEn, hastaISO))),
    db
      .select({
        clienteId: conversacionesWhatsapp.clienteId,
        telefono: conversacionesWhatsapp.telefono,
        direccion: mensajesWhatsapp.direccion,
        fecha: mensajesWhatsapp.creadoEn,
      })
      .from(mensajesWhatsapp)
      .innerJoin(conversacionesWhatsapp, eq(mensajesWhatsapp.conversacionId, conversacionesWhatsapp.id))
      .where(and(gte(mensajesWhatsapp.creadoEn, desdeISO), lte(mensajesWhatsapp.creadoEn, hastaISO))),
  ]);

  return [
    ...correos.map((c) => ({
      clienteId: c.clienteId || undefined,
      canal: "correo" as const,
      // El correo automático siempre sale desde acá: la bandeja de entrada de
      // info@ es otra cosa y no está atada a la ficha (ver @/lib/buzon).
      direccion: "saliente" as const,
      fecha: c.fecha,
    })),
    ...whatsapp.map((m) => ({
      clienteId: m.clienteId || undefined,
      telefono: m.telefono,
      canal: "whatsapp" as const,
      direccion: m.direccion === "entrante" ? ("entrante" as const) : ("saliente" as const),
      fecha: m.fecha,
    })),
  ];
}

/**
 * Cuántas veces disparó cada regla, en total y en el período, y cuántas
 * terminaron en error. NO trae las reglas: esas ya viajan en AppData (ver
 * `reglasCorreo`/`reglasWhatsapp`) y las edita `commit`, así que leerlas de
 * acá sería una segunda fuente de verdad — al prender una regla desde la
 * pantalla, esta copia quedaría mostrando el valor viejo.
 *
 * Los conteos van en SQL con `count(*) filter`: bajar los disparos al
 * navegador para contarlos eran decenas de miles de filas para mostrar seis
 * números.
 */
export async function contarDisparosPorRegla(
  desdeISO: string,
  hastaISO: string
): Promise<{ correo: ConteoDisparos[]; whatsapp: ConteoDisparos[] }> {
  const db = getDb();

  // Las dos consultas son la misma forma sobre tablas distintas. Se escriben
  // dos veces a propósito: factorizarlas en un helper genérico sobre
  // `typeof disparosReglaCorreo | typeof disparosReglaWhatsapp` no le pasa por
  // el tipo a drizzle (.from() exige una tabla concreta).
  const [correo, whatsapp] = await Promise.all([
    db
      .select({
        reglaId: disparosReglaCorreo.reglaId,
        disparosTotales: sql<number>`count(*)::int`,
        disparosPeriodo: sql<number>`count(*) filter (where ${disparosReglaCorreo.creadoEn} >= ${desdeISO} and ${disparosReglaCorreo.creadoEn} <= ${hastaISO})::int`,
        erroresPeriodo: sql<number>`count(*) filter (where ${disparosReglaCorreo.estado} = 'error' and ${disparosReglaCorreo.creadoEn} >= ${desdeISO} and ${disparosReglaCorreo.creadoEn} <= ${hastaISO})::int`,
        ultimoDisparo: sql<string | null>`max(${disparosReglaCorreo.creadoEn})::text`,
      })
      .from(disparosReglaCorreo)
      .groupBy(disparosReglaCorreo.reglaId),
    db
      .select({
        reglaId: disparosReglaWhatsapp.reglaId,
        disparosTotales: sql<number>`count(*)::int`,
        disparosPeriodo: sql<number>`count(*) filter (where ${disparosReglaWhatsapp.creadoEn} >= ${desdeISO} and ${disparosReglaWhatsapp.creadoEn} <= ${hastaISO})::int`,
        // El motor de WhatsApp no guarda "error" como estado del disparo (el
        // motivo real vive en mensajes_whatsapp.error, ver el comentario de
        // disparosReglaWhatsapp): acá siempre da 0, y por eso una palanca de
        // WhatsApp nunca se marca como que rebota.
        erroresPeriodo: sql<number>`count(*) filter (where ${disparosReglaWhatsapp.estado} = 'error' and ${disparosReglaWhatsapp.creadoEn} >= ${desdeISO} and ${disparosReglaWhatsapp.creadoEn} <= ${hastaISO})::int`,
        ultimoDisparo: sql<string | null>`max(${disparosReglaWhatsapp.creadoEn})::text`,
      })
      .from(disparosReglaWhatsapp)
      .groupBy(disparosReglaWhatsapp.reglaId),
  ]);

  const limpiar = (filas: typeof correo) =>
    filas.map((f) => ({ ...f, ultimoDisparo: f.ultimoDisparo || undefined }));

  return { correo: limpiar(correo), whatsapp: limpiar(whatsapp) };
}

/**
 * Todo número que escribió por WhatsApp y no quedó enlazado a una ficha.
 *
 * Es el padrón completo de contactos entrantes: la Graph API de Meta no
 * expone la lista de conversaciones ni de contactos, así que la única fuente
 * es esta tabla, que el webhook (/api/whatsapp) viene llenando desde el
 * primer mensaje recibido.
 *
 * Devuelve TODOS los que tienen `cliente_id` nulo, sin filtrar por teléfono:
 * el cruce final contra `clientes` se hace en el navegador con
 * indexarClientesPorTelefono, que es la normalización que ya usa Mensajes
 * WhatsApp. Replicarla en SQL sería una segunda definición de "este número es
 * de esta ficha" — y es justo lo que hace que a algunos les falte el enlace.
 */
export async function listarConversacionesSinFicha(): Promise<ConversacionSinFicha[]> {
  const filas = await getDb()
    .select({
      conversacionId: conversacionesWhatsapp.id,
      telefono: conversacionesWhatsapp.telefono,
      nombreContacto: conversacionesWhatsapp.nombreContacto,
      flowState: conversacionesWhatsapp.flowState,
      primerContacto: conversacionesWhatsapp.creadoEn,
      ultimoMensajeEn: conversacionesWhatsapp.ultimoMensajeEn,
      mensajes: sql<number>`count(${mensajesWhatsapp.id})::int`,
      escribio: sql<number>`count(${mensajesWhatsapp.id}) filter (where ${mensajesWhatsapp.direccion} = 'entrante')::int`,
      // Solo los textos entrantes y sin repetir: alcanzan para clasificar por
      // qué opción del menú entró (ver interesDeMensajes) sin bajar la
      // conversación completa.
      textos: sql<string[]>`coalesce(array_agg(distinct lower(trim(${mensajesWhatsapp.texto}))) filter (where ${mensajesWhatsapp.direccion} = 'entrante'), '{}')`,
    })
    .from(conversacionesWhatsapp)
    .leftJoin(mensajesWhatsapp, eq(mensajesWhatsapp.conversacionId, conversacionesWhatsapp.id))
    .where(isNull(conversacionesWhatsapp.clienteId))
    .groupBy(conversacionesWhatsapp.id);

  return filas.map((f) => ({
    conversacionId: f.conversacionId,
    telefono: f.telefono,
    nombreContacto: f.nombreContacto || undefined,
    primerContacto: f.primerContacto,
    ultimoMensajeEn: f.ultimoMensajeEn,
    mensajes: f.mensajes,
    escribio: f.escribio,
    interes: interesDeMensajes(f.textos ?? []),
    // El flujo a medias es la señal más fuerte de la lista: pidió el descuento
    // y se cortó cuando el bot le pidió el primer dato.
    flujoAbandonado: f.flowState ? { tipo: f.flowState.tipo, paso: f.flowState.paso } : undefined,
  }));
}

/**
 * Patentes con cobro automático Oneclick andando. Es por patente y no por
 * cliente porque la inscripción de tarjeta va por patente (ver
 * suscripcionesOneclick en @/db/schema/pagos): un mismo dueño con dos autos
 * puede tener uno con cobro automático y el otro no.
 *
 * No cubre la renovación automática vieja de WooCommerce — esa se lee de
 * `clientes.renovacionAutoWooDesde`, que ya viaja en AppData.
 */
export async function listarPatentesConAutopago(): Promise<string[]> {
  const filas = await getDb()
    .select({ patente: suscripcionesOneclick.patente })
    .from(suscripcionesOneclick)
    .where(eq(suscripcionesOneclick.estado, "activa"));
  return filas.map((f) => f.patente);
}

/**
 * Cobros Oneclick del período. Un rechazo es el desvío silencioso del embudo:
 * el cliente no hizo nada y se le cae el plan, así que la pantalla necesita
 * poder cruzarlo contra si la regla de "cobro_fallido" avisó o no.
 */
export async function contarCobrosPeriodo(desdeISO: string, hastaISO: string): Promise<{ aprobados: number; rechazados: number }> {
  const filas = await getDb()
    .select({ estado: cobrosOneclick.estado, n: sql<number>`count(*)::int` })
    .from(cobrosOneclick)
    .where(and(gte(cobrosOneclick.creadoEn, desdeISO), lte(cobrosOneclick.creadoEn, hastaISO)))
    .groupBy(cobrosOneclick.estado);

  return {
    aprobados: filas.find((f) => f.estado === "aprobada")?.n ?? 0,
    rechazados: filas.find((f) => f.estado === "rechazada")?.n ?? 0,
  };
}

/**
 * Todo lo que se le dijo a UN cliente, con contenido, para la línea de
 * tiempo de su ficha. Los cobros Oneclick entran acá y no en las ventas
 * porque un cobro RECHAZADO no genera venta: es justo el evento que explica
 * por qué el cliente se cayó del plan sin haber hecho nada.
 */
export async function listarComunicacionesCliente(
  clienteId: string,
  telefono: string | undefined,
  patente: string
): Promise<ComunicacionesCliente> {
  const db = getDb();
  // El hilo de WhatsApp se busca por ficha y por número: ver el comentario de
  // ComunicacionPeriodo sobre por qué cliente_id puede estar vacío.
  const filtroConversacion = telefono
    ? or(eq(conversacionesWhatsapp.clienteId, clienteId), eq(conversacionesWhatsapp.telefono, telefono))
    : eq(conversacionesWhatsapp.clienteId, clienteId);

  const [correos, whatsapp, cobros] = await Promise.all([
    db
      .select({
        id: correosAutomaticos.id,
        fecha: correosAutomaticos.creadoEn,
        asunto: correosAutomaticos.asunto,
        estado: correosAutomaticos.estado,
        error: correosAutomaticos.error,
      })
      .from(correosAutomaticos)
      .where(eq(correosAutomaticos.clienteId, clienteId))
      .orderBy(desc(correosAutomaticos.creadoEn))
      .limit(200),
    db
      .select({
        id: mensajesWhatsapp.id,
        fecha: mensajesWhatsapp.creadoEn,
        texto: mensajesWhatsapp.texto,
        direccion: mensajesWhatsapp.direccion,
        estado: mensajesWhatsapp.estado,
        error: mensajesWhatsapp.error,
      })
      .from(mensajesWhatsapp)
      .innerJoin(conversacionesWhatsapp, eq(mensajesWhatsapp.conversacionId, conversacionesWhatsapp.id))
      .where(filtroConversacion)
      .orderBy(desc(mensajesWhatsapp.creadoEn))
      .limit(200),
    db
      .select({
        id: cobrosOneclick.id,
        fecha: cobrosOneclick.creadoEn,
        monto: cobrosOneclick.monto,
        estado: cobrosOneclick.estado,
        cicloYm: cobrosOneclick.cicloYm,
      })
      .from(cobrosOneclick)
      .innerJoin(suscripcionesOneclick, eq(cobrosOneclick.suscripcionId, suscripcionesOneclick.id))
      .where(or(eq(suscripcionesOneclick.clienteId, clienteId), eq(suscripcionesOneclick.patente, patente)))
      .orderBy(desc(cobrosOneclick.creadoEn))
      .limit(200),
  ]);

  return {
    correos: correos.map((c) => ({ ...c, error: c.error || undefined })),
    whatsapp: whatsapp.map((m) => ({
      id: m.id,
      fecha: m.fecha,
      texto: m.texto,
      direccion: m.direccion === "entrante" ? ("entrante" as const) : ("saliente" as const),
      estado: m.estado || undefined,
      error: m.error || undefined,
    })),
    cobros,
  };
}
