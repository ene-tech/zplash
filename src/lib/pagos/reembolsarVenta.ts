import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { clientes, cobrosOneclick, movimientosContables, pagosWebpay, pagosWebpayItems, ventas } from "@/db/schema";
import { movimientoToRow } from "@/lib/dataAccess/contabilidad";
import {
  esEmailEnviable,
  idMovimientoContableDeVenta,
  movimientoContableDeReembolso,
  PREFIJO_VENTA_REEMBOLSO,
  sumarMesesFecha,
  TIPO_VENTA_REEMBOLSO,
  TIPOS_VENTA_PLAN,
} from "@/lib/helpers";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { enviarSms, msisdnChile } from "@/lib/sms/enviar";
import { oneclickChildCommerceCode, oneclickTransaction, webpayTransaction } from "@/lib/transbank";
import type { Venta } from "@/types";
import {
  adjuntarComprobanteReembolso,
  armarComprobanteReembolso,
  asuntoComprobanteReembolso,
  CREADO_POR_REEMBOLSO,
  htmlComprobanteReembolso,
  nombreArchivoComprobante,
  pdfComprobanteReembolso,
  smsComprobanteReembolso,
  type PagoReembolsado,
} from "./comprobanteReembolso";

/** Id determinístico del contra-asiento: además de enlazar reembolso y venta
 * original sin columna nueva, la PK impide reembolsar dos veces la misma
 * venta aunque dos operadores lo intenten a la vez. */
export function idVentaReembolso(ventaId: string): string {
  return PREFIJO_VENTA_REEMBOLSO + ventaId;
}

/** `vencimiento` viene solo si se anuló la vigencia (el nuevo valor del cliente). */
export type ResultadoReembolso = { ok: true; venta: Venta; vencimiento?: string } | { ok: false; error: string };

/**
 * Devuelve a la tarjeta un pago cobrado por Transbank (Webpay u Oneclick) y
 * deja el registro en `ventas` como un contra-asiento: tipo "Reembolso",
 * precio NEGATIVO y fecha de HOY (no la de la venta original) — así el Cierre
 * de Caja del día en que se hizo el reembolso lo descuenta solo, tanto en
 * "Detalle de venta" (fila Reembolso, ver useCierreData) como en "Métodos de
 * pago" (resta en Tarjetas Transbank vía esTarjetaWeb + precio negativo).
 * Además escribe el asiento contable negativo en el canal de la venta
 * original (ver movimientoContableDeReembolso), así el EERR también lo resta.
 *
 * `montoPedido` permite una devolución PARCIAL (hasta lo cobrado por
 * Transbank para el ítem); sin él se devuelve el total. Un solo reembolso por
 * venta, total o parcial — misma regla que Transbank, que acepta una única
 * anulación parcial por transacción. El motivo queda en `notas`.
 * Ventas sin pago Transbank detrás (efectivo, POS GETNET, WooCommerce legacy)
 * no se pueden reembolsar desde acá: esa plata no la movió esta plataforma.
 *
 * `anularVigencia` (solo ventas de plan, lo decide el administrador): le quita
 * al cliente el mes que esa compra le sumó — vencimiento − 1 mes, simétrico a
 * aplicarPagoAprobado, que deja el vencimiento un mes
 * después. Restar y no "vencer hoy" respeta los meses que el cliente tenga
 * pagados aparte de esta venta.
 */
export async function reembolsarVentaTarjeta(
  ventaId: string,
  motivo: string,
  operador: string,
  montoPedido?: number,
  anularVigencia = false
): Promise<ResultadoReembolso> {
  // Qué compra y qué pago se devolvieron, para el comprobante al cliente (el
  // contra-asiento solo lo lleva en prosa dentro de `notas`). Objeto mutable y
  // no un `let` directo: TS no ve las asignaciones dentro del callback de la
  // transacción y a la variable la estrecharía a null acá afuera.
  const captura: { original?: { tipo: string; fecha: string }; pago?: PagoReembolsado } = {};

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
      .select({ monto: pagosWebpayItems.monto, token: pagosWebpay.token, buyOrder: pagosWebpay.buyOrder })
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
        captura.pago = { medio: "Webpay", ordenCompra: itemWebpay.buyOrder, cobrado: itemWebpay.monto };
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
        // Sin tarjeta: el cobro no guarda con cuál se cobró y la de la
        // suscripción puede ser otra (el cliente re-inscribió después).
        captura.pago = { medio: "Oneclick", ordenCompra: cobro.id, cobrado: cobro.monto };
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
      creadoPor: CREADO_POR_REEMBOLSO,
      metodoPago: "tarjeta",
      voucher: comprobante,
      notas: `Reembolso${monto < cobradoTotal ? " parcial" : ""} de "${venta.tipo}" del ${venta.fecha.slice(0, 10)} — ${motivo} (por ${operador})`,
    };

    // Dentro de la transacción: si la plata ya volvió y el contra-asiento se
    // escribe, la vigencia se ajusta en el mismo commit o nada.
    let vencimiento: string | undefined;
    if (anularVigencia && venta.clienteId && TIPOS_VENTA_PLAN.has(venta.tipo)) {
      const [cli] = await tx.select({ vencimiento: clientes.vencimiento }).from(clientes).where(eq(clientes.id, venta.clienteId)).limit(1);
      if (cli?.vencimiento) {
        vencimiento = sumarMesesFecha(new Date(cli.vencimiento), -1).toISOString();
        await tx.update(clientes).set({ vencimiento }).where(eq(clientes.id, venta.clienteId));
        filaReembolso.notas += ` — vigencia anulada (vencimiento ${cli.vencimiento.slice(0, 10)} → ${vencimiento.slice(0, 10)})`;
      }
    }

    // Asiento contable negativo en el canal de la venta original, para que el
    // EERR descuente el reembolso (antes seguía contándolo como ingreso). Se
    // llega acá solo con la devolución ya confirmada por Transbank, y va en la
    // misma transacción que el contra-asiento: los dos o ninguno. Su id sale
    // del contra-asiento, cuya PK ya impide un segundo reembolso.
    const [asientoOriginal] = await tx
      .select({ categoria: movimientosContables.categoria })
      .from(movimientosContables)
      .where(eq(movimientosContables.id, idMovimientoContableDeVenta(ventaId)))
      .limit(1);
    const asiento = movimientoContableDeReembolso(filaReembolso, venta, asientoOriginal?.categoria);

    // Insert directo (no dataAccess.insertVentas): un contra-asiento negativo
    // no debe gatillar reglas de WhatsApp/correo por venta nueva.
    await tx.insert(ventas).values({ ...filaReembolso, clienteId: venta.clienteId });
    await tx.insert(movimientosContables).values(movimientoToRow(asiento));
    return { ok: true, venta: filaReembolso, vencimiento };
  });

  // Comprobante al cliente por correo y SMS, con el mismo criterio que el
  // ticket de reactivación (ver otorgarTicketReactivacion): la plata ya se
  // devolvió y el contra-asiento ya está escrito, así que un fallo de Resend o
  // LabsMobile no puede hacer fallar el reembolso — va por after() y solo se
  // loguea. Es transaccional (confirma algo que ya pasó con su plata), no una
  // campaña: no mira sinComunicacionAuto. El mismo comprobante queda a la vista
  // en la ficha del cliente (ver cargarComprobanteReembolso).
  const { original: compra, pago } = captura;
  if (resultado.ok && resultado.venta.clienteId && compra && pago) {
    const [cliente] = await getDb()
      .select({ id: clientes.id, nombre: clientes.nombre, email: clientes.email, telefono: clientes.telefono })
      .from(clientes)
      .where(eq(clientes.id, resultado.venta.clienteId))
      .limit(1);
    if (cliente) {
      // Con el nombre de la venta, igual que al rearmarlo en la ficha
      // (cargarComprobanteReembolso), para que el correo y la ficha coincidan.
      const comprobante = armarComprobanteReembolso(resultado.venta, compra, pago);
      // El PDF queda en "Documentos adjuntos" de la ficha, haya correo o no.
      after(() =>
        adjuntarComprobanteReembolso(resultado.venta.id)
          .then((ok) => ok || console.error("No se pudo adjuntar el comprobante de reembolso", ventaId))
          .catch((error) => console.error("Error adjuntando el comprobante de reembolso", ventaId, error))
      );
      const email = (cliente.email || "").trim();
      if (esEmailEnviable(email)) {
        after(() =>
          enviarCorreoTransaccional({
            to: email,
            subject: asuntoComprobanteReembolso(comprobante),
            html: htmlComprobanteReembolso(comprobante),
            adjuntos: [{ nombre: nombreArchivoComprobante(comprobante), contenido: pdfComprobanteReembolso(comprobante) }],
            clienteId: cliente.id,
          }).catch((error) => console.error("Error enviando el correo de reembolso", ventaId, error))
        );
      }
      if (cliente.telefono && msisdnChile(cliente.telefono)) {
        after(() =>
          enviarSms({
            telefono: cliente.telefono!,
            texto: smsComprobanteReembolso(comprobante),
            campana: "comprobante-reembolso",
            clienteId: cliente.id,
            enviadoPor: operador,
            sinPieBaja: true,
          })
            .then((r) => r.ok || console.error("No se pudo mandar el SMS de reembolso", ventaId, r.error))
            .catch((error) => console.error("Error enviando el SMS de reembolso", ventaId, error))
        );
      }
    }
  }

  return resultado;
}
