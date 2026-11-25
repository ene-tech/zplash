import "server-only";
import { and, eq, gte, like } from "drizzle-orm";
import { urlLinkSms } from "@/lib/sms/texto";
import { getDb } from "@/db";
import { clientes, cupones, cuponesInstagram, mensajesSms, precios } from "@/db/schema";
import { cuponFromRow } from "@/lib/dataAccess/cupones";
import { obtenerSuscripcionOneclickCobrablePorPatente } from "@/lib/dataAccess/oneclick";
import { linkYaPagado } from "@/lib/pagos/cobrarLavadoOneclick";
import { cuponDescuentoDePatente, precioConCupon, precioLavadoUnico, precioLavadoUnicoWeb } from "@/lib/helpers";
import type { Precios } from "@/types";

// Link personal de un SMS de campaña: zplash.cl/v/CODIGO. El código es el
// mismo mensajes_sms.codigo_baja que se reserva por cada SMS (ver enviarSms):
// identifica al cliente sin poner su patente ni su id en la URL. Abre una
// página que ya sabe la patente y el descuento, y cobra el lavado con un toque
// si la patente tiene tarjeta Oneclick guardada (ver cobrarLavadoOneclick).
//
// El link no inicia sesión: solo deja ver y pagar el lavado de ESA patente. Si
// alguien reenvía su SMS, quien lo abra puede pagar con la tarjeta del dueño,
// pero el lavado queda en la patente del dueño. Por eso el botón muestra los
// 4 últimos dígitos y hay un solo cobro aprobado por link.

/** Días que el link sigue abriendo la oferta después de mandado el SMS. */
export const DIAS_VIGENCIA_LINK_SMS = 45;

/** Link del descuento de Instagram (ver @/lib/instagram/cuponSeguidor). A
 * diferencia del SMS, que solo le llega al celular del dueño, a este lo activa
 * cualquiera que escriba una patente: no cobra la tarjeta guardada con un
 * toque, solo deja pagar por Webpay con el descuento. */
export const CAMPANA_LINK_INSTAGRAM = "Instagram";

export function codigoLinkValido(codigo: string): boolean {
  return /^[A-Z0-9]{8}$/.test(codigo);
}

export interface LinkSms {
  codigo: string;
  campana: string;
  clienteId: string;
  patente: string;
  nombre: string;
  telefono: string | null;
  nonGrato: boolean;
  /** Cuándo salió el SMS: un lavado web pagado desde entonces es el de este link. */
  enviadoEn: string;
}

/** El cliente detrás de un código de SMS enviado y todavía vigente; null si
 * el código no existe, el SMS no salió, no tiene ficha o ya venció. */
export async function resolverLinkSms(codigoCrudo: string | null | undefined): Promise<LinkSms | null> {
  const codigo = (codigoCrudo || "").toUpperCase();
  if (!codigoLinkValido(codigo)) return null;
  const desde = new Date(Date.now() - DIAS_VIGENCIA_LINK_SMS * 24 * 60 * 60 * 1000).toISOString();
  const [fila] = await getDb()
    .select({
      campana: mensajesSms.campana,
      clienteId: clientes.id,
      patente: clientes.patente,
      nombre: clientes.nombre,
      telefono: clientes.telefono,
      nonGrato: clientes.nonGrato,
      enviadoEn: mensajesSms.creadoEn,
    })
    .from(mensajesSms)
    .innerJoin(clientes, eq(clientes.id, mensajesSms.clienteId))
    .where(
      and(
        eq(mensajesSms.codigoBaja, codigo),
        eq(mensajesSms.estado, "enviado"),
        gte(mensajesSms.creadoEn, desde),
        // Solo los SMS que de verdad llevaban el link: el código de cualquier
        // otro SMS (el de baja de antes) no abre un pago.
        like(mensajesSms.texto, `%${urlLinkSms(codigo)}%`)
      )
    )
    .limit(1);
  if (fila?.patente) return { codigo, ...fila, patente: fila.patente, nombre: fila.nombre || "" };

  // El link del descuento de Instagram (zplash.cl/ig/CODIGO), una vez activado
  // con una patente, abre el mismo pago (ver @/lib/instagram/cuponSeguidor).
  const [ig] = await getDb()
    .select({
      clienteId: clientes.id,
      patente: clientes.patente,
      nombre: clientes.nombre,
      telefono: clientes.telefono,
      nonGrato: clientes.nonGrato,
      activadoEn: cuponesInstagram.activadoEn,
    })
    .from(cuponesInstagram)
    .innerJoin(clientes, eq(clientes.id, cuponesInstagram.clienteId))
    .where(and(eq(cuponesInstagram.codigo, codigo), gte(cuponesInstagram.activadoEn, desde)))
    .limit(1);
  if (!ig?.patente || !ig.activadoEn) return null;
  // Quien activó el link pudo escribir una patente ajena: sin el nombre del
  // dueño en la página y sin cobro de un toque (ver CAMPANA_LINK_INSTAGRAM).
  return {
    codigo,
    campana: CAMPANA_LINK_INSTAGRAM,
    clienteId: ig.clienteId,
    patente: ig.patente,
    nombre: "",
    telefono: ig.telefono,
    nonGrato: ig.nonGrato,
    enviadoEn: ig.activadoEn,
  };
}

export interface OfertaLinkSms {
  precioLista: number;
  /** Precio a cobrar por la web (con el descuento web de la patente, si hay). */
  precioWeb: number;
  /** Descuento que vale en la web: el que se cobra online. */
  cuponWeb?: { codigo: string; caduca: string };
  /** Descuento que existe pero vale SOLO en el local (ej. campaña Vuelve
   * nov-2026): no se puede pagar online con ese precio. */
  cuponSoloLocal?: { precio: number; caduca: string };
  tarjeta?: { tipo: string; ultimos: string };
  /** Este link ya tiene un cobro aprobado. */
  yaPagado: boolean;
}

export async function ofertaLinkSms(link: LinkSms): Promise<OfertaLinkSms> {
  const db = getDb();
  const [filasPrecios, filasCupones, suscripcion, pagado] = await Promise.all([
    db.select().from(precios),
    db
      .select()
      .from(cupones)
      .where(and(eq(cupones.patenteAsignada, link.patente), eq(cupones.tipo, "descuento"), eq(cupones.usado, false))),
    obtenerSuscripcionOneclickCobrablePorPatente(link.patente),
    linkYaPagado(db, link),
  ]);
  const preciosMap: Precios = Object.fromEntries(filasPrecios.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));
  const precioLista = precioLavadoUnicoWeb(preciosMap);
  const lista = filasCupones.map(cuponFromRow);
  const ahora = new Date();
  const web = cuponDescuentoDePatente(lista, link.patente, "web", ahora);
  const local = web ? undefined : cuponDescuentoDePatente(lista, link.patente, "local", ahora);

  return {
    precioLista,
    precioWeb: precioConCupon(precioLista, web),
    cuponWeb: web ? { codigo: web.codigo, caduca: web.fechaCaducidad } : undefined,
    // Con el precio del mesón, que es donde se cobra ese descuento.
    cuponSoloLocal: local ? { precio: precioConCupon(precioLavadoUnico(preciosMap), local), caduca: local.fechaCaducidad } : undefined,
    tarjeta:
      suscripcion && link.campana !== CAMPANA_LINK_INSTAGRAM
        ? { tipo: suscripcion.cardTipo || "Tarjeta", ultimos: suscripcion.cardUltimosDigitos || "" }
        : undefined,
    yaPagado: pagado,
  };
}
