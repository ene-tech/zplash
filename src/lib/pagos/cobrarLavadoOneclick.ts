import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { comprasOneclick, precios, suscripcionesOneclick, ventas } from "@/db/schema";
import { obtenerSuscripcionOneclickCobrablePorPatente } from "@/lib/dataAccess/oneclick";
import { LAVADO_UNICO_WEB_TIPO, MENSAJE_PAGO_NON_GRATO, precioConCupon, precioLavadoUnicoWeb } from "@/lib/helpers";
import type { LinkSms } from "@/lib/linkSms";
import type { Precios } from "@/types";
import { aplicarPagoAprobado } from "./aplicarPagoAprobado";
import { buscarCuponDescuentoPlan } from "./cuponPlan";
import { autorizarCobro, consultarCobro, MSG_COBRO_SIN_CONFIRMAR } from "./oneclickCobro";

/** Pasado este plazo sin respuesta de Transbank, una compra en_curso se da por
 * no cobrada (mismo criterio que reconciliarCobrosEnCurso). */
const PLAZO_CONSULTA_MS = 3 * 24 * 60 * 60 * 1000;

const CREADO_POR = "Cliente (Oneclick)";

/** Errores que se le muestran tal cual al cliente en /api/v/[codigo]/pagar;
 * cualquier otro (base, SDK de Transbank) sale con un mensaje genérico. */
export class ErrorCompraOneclick extends Error {}

const MSG_LAVADO_SIN_CONFIRMAR =
  "No pudimos confirmar el pago con el banco. No lo vuelvas a intentar: lo revisamos y, si se cobró, el lavado queda cargado a tu patente.";

type Compra = typeof comprasOneclick.$inferSelect;

/** Deja la venta de un lavado ya cobrado. La misma venta "Lavado único (Web)"
 * que deja Webpay, así el mesón la canjea igual (ventaLavadoWebPendiente). */
async function aplicarLavado(tx: DbOrTx, compra: Pick<Compra, "id" | "patente" | "monto" | "cuponCodigo">, email: string | null, telefono: string | null) {
  const ventaId = "oc-" + compra.id;
  try {
    await tx.transaction(async (tx2) => {
      await aplicarPagoAprobado(
        {
          patente: compra.patente,
          monto: compra.monto,
          ventaId,
          metodoPago: "tarjeta",
          creadoPor: CREADO_POR,
          esServicioAdicional: true,
          tipoVentaNuevo: LAVADO_UNICO_WEB_TIPO,
          tipoVentaExistente: LAVADO_UNICO_WEB_TIPO,
          email,
          telefono,
          cuponCodigo: compra.cuponCodigo,
        },
        tx2
      );
    });
    return ventaId;
  } catch (error) {
    // Transbank ya cobró: el cobro queda "aprobada" igual, sin venta, para
    // revisión manual (mismo criterio que cobrarOfertaOneclick).
    console.error("Lavado Oneclick aprobado por Transbank pero no se pudo aplicar en la base — requiere revisión manual", compra.id, error);
    return null;
  }
}

function lockPatente(tx: DbOrTx, patente: string) {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"compra-oneclick:" + patente}))`);
}

/**
 * Le pregunta a Transbank por las compras de un toque de la patente que
 * quedaron "en_curso" (la función se cortó o el banco no contestó) y las
 * cierra: aprobada → se aplica el lavado; rechazada o vencido el plazo → se
 * marca rechazada. Commit propio: lo aplicado no se pierde aunque el cobro
 * que viene después falle. Lo usan el próximo toque y el cron de conciliación.
 */
export async function reconciliarComprasEnCurso(patente: string): Promise<{ linksAprobados: string[]; sinRespuesta: boolean }> {
  return getDb().transaction(async (tx) => {
    await lockPatente(tx, patente);
    const huerfanas = await tx
      .select()
      .from(comprasOneclick)
      .where(and(eq(comprasOneclick.patente, patente), eq(comprasOneclick.estado, "en_curso")));
    const linksAprobados: string[] = [];
    let sinRespuesta = false;
    for (const compra of huerfanas) {
      const detalle = await consultarCobro(compra.id);
      if (!detalle && Date.now() - new Date(compra.creadoEn).getTime() < PLAZO_CONSULTA_MS) {
        sinRespuesta = true;
        continue;
      }
      if (detalle?.response_code === 0) {
        // Ya estaba cobrado: se aplica y no se cobra de nuevo.
        const [contacto] = compra.suscripcionId
          ? await tx
              .select({ email: suscripcionesOneclick.email, telefono: suscripcionesOneclick.telefono })
              .from(suscripcionesOneclick)
              .where(eq(suscripcionesOneclick.id, compra.suscripcionId))
              .limit(1)
          : [];
        const ventaId = await aplicarLavado(tx, compra, contacto?.email ?? null, contacto?.telefono ?? null);
        await tx
          .update(comprasOneclick)
          .set({ estado: "aprobada", responseCode: 0, authorizationCode: detalle.authorization_code || null, ventaId })
          .where(eq(comprasOneclick.id, compra.id));
        if (compra.codigoLink) linksAprobados.push(compra.codigoLink);
        continue;
      }
      await tx
        .update(comprasOneclick)
        .set({ estado: "rechazada", responseCode: detalle?.response_code ?? null })
        .where(eq(comprasOneclick.id, compra.id));
    }
    return { linksAprobados, sinRespuesta };
  });
}

/** Cron (ver /api/pagos/webpay/conciliar): cierra las compras de un toque que
 * quedaron "en_curso". Sin esto solo se revisaban si el cliente volvía a
 * tocar, y el mensaje le pide justamente que no lo haga. */
export async function conciliarComprasOneclick(esperaMs = 5 * 60 * 1000): Promise<{ patente: string; resultado: string }[]> {
  const filas = await getDb()
    .selectDistinct({ patente: comprasOneclick.patente })
    .from(comprasOneclick)
    .where(and(eq(comprasOneclick.estado, "en_curso"), lt(comprasOneclick.creadoEn, new Date(Date.now() - esperaMs).toISOString())));
  const resultados: { patente: string; resultado: string }[] = [];
  for (const { patente } of filas) {
    try {
      const r = await reconciliarComprasEnCurso(patente);
      if (r.linksAprobados.length) console.error("Compra Oneclick cobrada que había quedado en curso — conciliada", patente, r.linksAprobados);
      resultados.push({ patente, resultado: r.sinRespuesta ? "sin_respuesta" : r.linksAprobados.length ? "aprobada" : "cerrada" });
    } catch (error) {
      console.error("No se pudo conciliar la compra Oneclick", patente, error);
      resultados.push({ patente, resultado: "error" });
    }
  }
  return resultados;
}

/** ¿Este link ya tiene su lavado pagado? Por el toque (compras_oneclick) o
 * por "Pagar con otra tarjeta" (Webpay, que no guarda el código): cualquier
 * "Lavado único (Web)" de la patente desde que salió el SMS. Sin lo segundo,
 * quien pagó por Webpay volvía al link y un toque le cobraba otro lavado. */
export async function linkYaPagado(db: DbOrTx, link: Pick<LinkSms, "codigo" | "patente" | "enviadoEn">): Promise<boolean> {
  const [porToque] = await db
    .select({ id: comprasOneclick.id })
    .from(comprasOneclick)
    .where(and(eq(comprasOneclick.codigoLink, link.codigo), eq(comprasOneclick.estado, "aprobada")))
    .limit(1);
  if (porToque) return true;
  const [porWeb] = await db
    .select({ id: ventas.id })
    .from(ventas)
    .where(and(eq(ventas.patente, link.patente), eq(ventas.tipo, LAVADO_UNICO_WEB_TIPO), gte(ventas.fecha, link.enviadoEn)))
    .limit(1);
  return !!porWeb;
}

/**
 * Cobra un lavado único con un toque contra la tarjeta que la patente ya tiene
 * en Oneclick, desde el link personal de un SMS (ver @/lib/linkSms). Sin
 * redirigir a Webpay: la pantalla de Transbank es donde la gente abandona.
 *
 * Mismas defensas que los otros cobros Oneclick: advisory lock por patente
 * contra el doble toque, reserva con commit propio antes de autorizar (si la
 * función se corta, la fila "en_curso" sobrevive y la cierra
 * reconciliarComprasEnCurso), monto recalculado acá y un solo lavado pagado
 * por link.
 */
export async function cobrarLavadoOneclick(link: LinkSms): Promise<{ estado: "aprobada" | "rechazada"; buyOrder?: string }> {
  if (link.nonGrato) throw new ErrorCompraOneclick(MENSAJE_PAGO_NON_GRATO);
  const suscripcion = await obtenerSuscripcionOneclickCobrablePorPatente(link.patente);
  if (!suscripcion?.tbkUser) throw new ErrorCompraOneclick("Esta patente no tiene una tarjeta guardada activa");
  const tbkUser = suscripcion.tbkUser;

  // Intentos anteriores que se cortaron sin saber si Transbank cobró. Uno de
  // ESTE link que sí se cobró es el pago que el cliente está reintentando; los
  // de otros links se aplican y se sigue.
  const previo = await reconciliarComprasEnCurso(link.patente);
  if (previo.linksAprobados.includes(link.codigo)) return { estado: "aprobada" };
  if (previo.sinRespuesta) throw new ErrorCompraOneclick(MSG_LAVADO_SIN_CONFIRMAR);

  return getDb().transaction(async (tx) => {
    await lockPatente(tx, link.patente);

    // Otro toque pudo dejar una reserva entre la reconciliación y este lock.
    const [enCurso] = await tx
      .select({ id: comprasOneclick.id })
      .from(comprasOneclick)
      .where(and(eq(comprasOneclick.patente, link.patente), eq(comprasOneclick.estado, "en_curso")))
      .limit(1);
    if (enCurso) throw new ErrorCompraOneclick(MSG_LAVADO_SIN_CONFIRMAR);

    if (await linkYaPagado(tx, link)) throw new ErrorCompraOneclick("Este lavado ya está pagado. En el local solo di tu patente.");

    // Precio con datos frescos y el descuento web de la patente, resuelto
    // dentro de la transacción: lo que se cobra y el cupón que se quema son el
    // mismo dato (ver buscarCuponDescuentoPlan).
    const filasPrecios = await tx.select().from(precios);
    const preciosMap: Precios = Object.fromEntries(filasPrecios.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));
    const cupon = await buscarCuponDescuentoPlan(link.patente, tx);
    const monto = precioConCupon(precioLavadoUnicoWeb(preciosMap), cupon);
    if (monto <= 0) throw new ErrorCompraOneclick("Tu descuento cubre el total: úsalo en el local, se aplica solo al pasar por el túnel");

    // buyOrder ≤ 26 caracteres (Transbank): "co" + ms en base 36 + 4 al azar.
    const buyOrder = "co" + Date.now().toString(36) + Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
    // Commit propio, fuera de esta transacción (ver reservarCobro).
    await getDb()
      .insert(comprasOneclick)
      .values({
        id: buyOrder,
        patente: link.patente,
        suscripcionId: suscripcion.id,
        codigoLink: link.codigo,
        concepto: "lavado_unico",
        monto,
        cuponCodigo: cupon?.codigo ?? null,
        estado: "en_curso",
      });

    // Sin respuesta de Transbank esto tira y la reserva queda "en_curso". El
    // mensaje de autorizarCobro habla del plan: acá es un lavado.
    const detalle = await autorizarCobro(suscripcion.username, tbkUser, buyOrder, monto).catch((error) => {
      if (error instanceof Error && error.message === MSG_COBRO_SIN_CONFIRMAR) throw new ErrorCompraOneclick(MSG_LAVADO_SIN_CONFIRMAR);
      throw error;
    });
    const aprobada = detalle?.response_code === 0;
    const ventaId = aprobada
      ? await aplicarLavado(tx, { id: buyOrder, patente: link.patente, monto, cuponCodigo: cupon?.codigo ?? null }, suscripcion.email, suscripcion.telefono)
      : null;
    await tx
      .update(comprasOneclick)
      .set({
        estado: aprobada ? "aprobada" : "rechazada",
        responseCode: detalle?.response_code ?? null,
        authorizationCode: detalle?.authorization_code || null,
        ventaId,
      })
      .where(eq(comprasOneclick.id, buyOrder));
    return { estado: aprobada ? ("aprobada" as const) : ("rechazada" as const), buyOrder };
  });
}
