import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { clientes, cobrosOneclick, pagosWebpay, pagosWebpayItems, ventas } from "@/db/schema";
import { esEmailEnviable, fmtCLP, fmtFecha, TIPO_VENTA_REEMBOLSO } from "@/lib/helpers";
import { envolverHtmlBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { oneclickChildCommerceCode, oneclickTransaction, webpayTransaction } from "@/lib/transbank";
import type { Venta } from "@/types";

// El motivo es texto libre del operador y va incrustado en el HTML del
// correo: se escapa para que no pueda meter markup (nombre y tipo por si
// acaso, mismo costo).
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function htmlReembolso(nombre: string, monto: number, compra: string, fechaCompra: string, motivo: string): string {
  return envolverHtmlBase(`
    <p style="margin:0 0 20px;">Hola ${esc(nombre)}, te hicimos una devolución a tu tarjeta.</p>
    <p style="margin:0 0 8px;">Monto devuelto:</p>
    <p style="margin:0 0 20px; font-size:32px; font-weight:bold; color:#262320;">${fmtCLP(monto)}</p>
    <p style="margin:0 0 20px;">Corresponde a tu compra <strong>${esc(compra)}</strong> del ${fechaCompra}. Motivo: ${esc(motivo)}.</p>
    <p style="margin:0;">El abono lo verás reflejado en tu tarjeta dentro de los próximos días, según los plazos de tu banco. Cualquier duda, respóndenos a este correo.</p>
  `);
}

/** Id determinístico del contra-asiento: además de enlazar reembolso y venta
 * original sin columna nueva, la PK impide reembolsar dos veces la misma
 * venta aunque dos operadores lo intenten a la vez. */
export function idVentaReembolso(ventaId: string): string {
  return "reembolso-" + ventaId;
}

export type ResultadoReembolso = { ok: true; venta: Venta } | { ok: false; error: string };

/**
 * Devuelve a la tarjeta un pago cobrado por Transbank (Webpay u Oneclick) y
 * deja el registro en `ventas` como un contra-asiento: tipo "Reembolso",
 * precio NEGATIVO y fecha de HOY (no la de la venta original) — así el Cierre
 * de Caja del día en que se hizo el reembolso lo descuenta solo, tanto en
 * "Detalle de venta" (fila Reembolso, ver useCierreData) como en "Métodos de
 * pago" (resta en Tarjetas Transbank vía esTarjetaWeb + precio negativo).
 *
 * `montoPedido` permite una devolución PARCIAL (hasta lo cobrado por
 * Transbank para el ítem); sin él se devuelve el total. Un solo reembolso por
 * venta, total o parcial — misma regla que Transbank, que acepta una única
 * anulación parcial por transacción. El motivo queda en `notas`.
 * Ventas sin pago Transbank detrás (efectivo, POS GETNET, WooCommerce legacy)
 * no se pueden reembolsar desde acá: esa plata no la movió esta plataforma.
 */
export async function reembolsarVentaTarjeta(
  ventaId: string,
  motivo: string,
  operador: string,
  montoPedido?: number
): Promise<ResultadoReembolso> {
  // Qué compra se devolvió, para el correo al cliente (el contra-asiento solo
  // lo lleva en prosa dentro de `notas`). Objeto mutable y no un `let` directo:
  // TS no ve las asignaciones dentro del callback de la transacción y a la
  // variable la estrecharía a null acá afuera.
  const captura: { original?: { tipo: string; fecha: string } } = {};

  const resultado = await getDb().transaction(async (tx): Promise<ResultadoReembolso> => {
    // Mismo patrón que cobrarSuscripcion: el chequeo "¿ya reembolsada?", la
    // llamada a Transbank y la escritura corren bajo un advisory lock por
    // venta, para que dos clics simultáneos no pasen ambos el chequeo antes
    // de que el primero escriba su contra-asiento.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ventaId}))`);

    const [venta] = await tx.select().from(ventas).where(eq(ventas.id, ventaId)).limit(1);
    if (!venta) return { ok: false, error: "La venta no existe." };
    if (venta.tipo === TIPO_VENTA_REEMBOLSO || (venta.precio ?? 0) <= 0) {
      return { ok: false, error: "Esta venta no se puede reembolsar." };
    }

    const [yaReembolsada] = await tx.select({ id: ventas.id }).from(ventas).where(eq(ventas.id, idVentaReembolso(ventaId))).limit(1);
    if (yaReembolsada) return { ok: false, error: "Esta venta ya fue reembolsada." };
    captura.original = { tipo: venta.tipo, fecha: venta.fecha };

    // El pago Transbank detrás de la venta: mismo par de fuentes que
    // listarDetallePagosVentas (ver @/lib/dataAccess/pagos).
    const [itemWebpay] = await tx
      .select({ monto: pagosWebpayItems.monto, token: pagosWebpay.token })
      .from(pagosWebpayItems)
      .innerJoin(pagosWebpay, eq(pagosWebpay.buyOrder, pagosWebpayItems.buyOrder))
      .where(and(eq(pagosWebpayItems.ventaId, ventaId), eq(pagosWebpay.estado, "aprobada")))
      .limit(1);

    // Tope: lo que Transbank cobró de verdad por el ÍTEM (no el total del
    // buyOrder — un carrito Webpay cobra varios ítems en una transacción y
    // acá solo se devuelve lo de esta venta; Transbank lo acepta como
    // reembolso parcial). El monto pedido se valida contra ese dato de la
    // base, nunca contra lo que diga la pantalla.
    const montoAReembolsar = (cobrado: number): number | null => {
      if (montoPedido === undefined) return cobrado;
      if (!Number.isInteger(montoPedido) || montoPedido <= 0 || montoPedido > cobrado) return null;
      return montoPedido;
    };

    let monto: number;
    let cobradoTotal = 0;
    let comprobante: string;
    try {
      if (itemWebpay?.token) {
        cobradoTotal = itemWebpay.monto;
        const montoOk = montoAReembolsar(itemWebpay.monto);
        if (montoOk === null) return { ok: false, error: "El monto a devolver debe ser entre $1 y lo cobrado a la tarjeta." };
        monto = montoOk;
        const r = await webpayTransaction().refund(itemWebpay.token, monto);
        if (!(r?.type === "REVERSED" || (r?.type === "NULLIFIED" && r?.response_code === 0))) {
          return { ok: false, error: "Transbank rechazó el reembolso." };
        }
        comprobante = r.authorization_code || r.type;
      } else {
        const [cobro] = await tx
          .select({ id: cobrosOneclick.id, monto: cobrosOneclick.monto })
          .from(cobrosOneclick)
          .where(and(eq(cobrosOneclick.ventaId, ventaId), eq(cobrosOneclick.estado, "aprobada")))
          .limit(1);
        if (!cobro) return { ok: false, error: "Esta venta no tiene un pago con tarjeta por Transbank asociado." };
        cobradoTotal = cobro.monto;
        const montoOk = montoAReembolsar(cobro.monto);
        if (montoOk === null) return { ok: false, error: "El monto a devolver debe ser entre $1 y lo cobrado a la tarjeta." };
        monto = montoOk;
        // El id del cobro es a la vez parent y child buy_order (ver
        // cobrosOneclick en @/db/schema/pagos).
        const r = await oneclickTransaction().refund(cobro.id, oneclickChildCommerceCode(), cobro.id, monto);
        if (!(r?.type === "REVERSED" || (r?.type === "NULLIFIED" && r?.response_code === 0))) {
          return { ok: false, error: "Transbank rechazó el reembolso." };
        }
        comprobante = r.authorization_code || r.type;
      }
    } catch (error) {
      console.error("Error pidiendo el reembolso a Transbank", ventaId, error);
      return { ok: false, error: "Transbank rechazó el reembolso." };
    }

    const filaReembolso: Venta = {
      id: idVentaReembolso(ventaId),
      clienteId: venta.clienteId ?? "",
      patente: venta.patente,
      nombre: venta.nombre,
      plan: venta.plan,
      precio: -monto,
      tipo: TIPO_VENTA_REEMBOLSO,
      fecha: new Date().toISOString(),
      // "Automático" al inicio a propósito: esTarjetaWeb lo lee como cobro
      // web Transbank y el Cierre de Caja lo resta de "Tarjetas Transbank".
      creadoPor: "Automático (Reembolso)",
      metodoPago: "tarjeta",
      voucher: comprobante,
      notas: `Reembolso${monto < cobradoTotal ? " parcial" : ""} de "${venta.tipo}" del ${venta.fecha.slice(0, 10)} — ${motivo} (por ${operador})`,
    };
    // Insert directo (no dataAccess.insertVentas): un contra-asiento negativo
    // no debe gatillar reglas de WhatsApp/correo por venta nueva.
    await tx.insert(ventas).values({ ...filaReembolso, clienteId: venta.clienteId });
    return { ok: true, venta: filaReembolso };
  });

  // Correo de confirmación al cliente, con el mismo criterio que el ticket de
  // reactivación (ver otorgarTicketReactivacion): la plata ya se devolvió y el
  // contra-asiento ya está escrito, así que un fallo de Resend no puede hacer
  // fallar el reembolso — va por after() y solo se loguea. Es transaccional
  // (confirma algo que ya pasó con su plata), no una campaña: no mira
  // sinComunicacionAuto.
  const compra = captura.original;
  if (resultado.ok && resultado.venta.clienteId && compra) {
    const [cliente] = await getDb()
      .select({ id: clientes.id, nombre: clientes.nombre, email: clientes.email })
      .from(clientes)
      .where(eq(clientes.id, resultado.venta.clienteId))
      .limit(1);
    const email = (cliente?.email || "").trim();
    if (cliente && esEmailEnviable(email)) {
      after(() =>
        enviarCorreoTransaccional({
          to: email,
          subject: `Te devolvimos ${fmtCLP(-resultado.venta.precio)} a tu tarjeta`,
          html: htmlReembolso(cliente.nombre, -resultado.venta.precio, compra.tipo, fmtFecha(compra.fecha), motivo),
          clienteId: cliente.id,
        }).catch((error) => console.error("Error enviando el correo de reembolso", ventaId, error))
      );
    }
  }

  return resultado;
}
