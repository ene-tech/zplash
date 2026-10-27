"use client";

import { useApp } from "@/context/AppContext";
import { entregarPromoLavados, entregarPromoRecompra2, entregarPromoVip, entregarUpgradeDescuento, entregarUpgradePack, registrarIngreso, registrarIngresoCupon, registrarIngresoDetailing, registrarIngresoLavadoWeb } from "@/lib/logic";
import { LAVADO_EXTRA_PLAN_TIPO, planStatus, MSG_TICKET_YA_PASO_HOY, PROMOS_LAVADOS, PROMO_RECOMPRA_2_KEY, PROMO_VIP_KEY, TICKETS_VIP_PATENTE, SOLO_TUNEL_KEY, patenteYaPasoHoy, TICKETS_UPGRADE_DESCUENTO, TICKETS_UPGRADE_PACK, precioSoloTunel, UPGRADE_DESCUENTO_KEY, UPGRADE_PACK_KEY, marcarDescuentoUsado, patenteAutorizadaParaCupon, precioPromoLavados, uidVenta, yaIngresoHoy, type EstadoReingresoPlan, type IdPromoLavados } from "@/lib/helpers";
import { conReglaVigente } from "./reglaVigente";
import type { Cita, Cliente, Cupon, PagoInfo, Venta } from "@/types";
import { ERROR_GUARDADO_INGRESO } from "./useOperadorFoundResult";

// Acciones de "dar ingreso" al vehículo: la garantía/bloqueo de reingreso, el
// check-in de un servicio de Detailing ya vendido, el canje de un lavado
// único ya pagado desde /pagar, y el cobro de un lavado único presencial
// (con o sin cupón de descuento vigente).
export function useIngresoActions(
  c: Cliente,
  clearPlate: () => void,
  setGuardarErr: (msg: string) => void,
  opts: {
    estadoIngreso: EstadoReingresoPlan;
    citaDetailingPendiente: Cita | undefined;
    lavadoWebPendiente: Venta | undefined;
    cuponDescuentoVigente: Cupon | undefined;
    precioLavadoUnicoFinal: number;
    // Solo el descuento de primera vez del bot (ver cuponValeEnSoloTunel).
    cuponSoloTunel: Cupon | undefined;
    precioSoloTunelFinal: number;
  }
) {
  const { data, ui, commit, patchUi } = useApp();
  const { estadoIngreso, citaDetailingPendiente, lavadoWebPendiente, cuponDescuentoVigente, precioLavadoUnicoFinal, cuponSoloTunel, precioSoloTunelFinal } = opts;

  const hacerRegistro = async (esGarantia: boolean, cliente: Cliente) => {
    const patch = registrarIngreso(data, cliente, ui.perfilActual?.nombre, esGarantia);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrarDetailing = async (cliente: Cliente = c) => {
    if (!citaDetailingPendiente) return;
    const patch = registrarIngresoDetailing(data, cliente, citaDetailingPendiente, ui.perfilActual?.nombre);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrar = (cliente: Cliente = c) => {
    if (estadoIngreso === "garantia") {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `Vehiculo Ingreso hace menos de 24 horas. ¿Desea que pase nuevamente por garantía?`,
          confirmLabel: "Sí, ingresar por garantía",
          danger: false,
          onConfirm: () => hacerRegistro(true, cliente),
        },
      });
      return;
    }
    hacerRegistro(false, cliente);
  };

  // Compra un lavado único y da ingreso sin condicionar a plan/garantía —
  // usado tanto desde "Lavado Full Túnel" (plan no vigente) como desde el
  // botón de "comprar de todas formas" cuando el reingreso está bloqueado.
  const cobrarLavadoUnico = (cliente: Cliente = c) => {
    const precio = precioLavadoUnicoFinal;
    const confirmarCobro = async (pago: PagoInfo) => {
      const ahora = new Date().toISOString();
      const patch = registrarIngreso(data, cliente, ui.perfilActual?.nombre);
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: cliente.id,
        patente: cliente.patente,
        nombre: cliente.nombre,
        plan: cliente.plan || "",
        precio,
        // Al de plan vigente (extra sin pasadas o reingreso pagado) es otro
        // producto: no le corresponden los mensajes del lavado único.
        tipo: estadoIngreso === "sin_pases" || planStatus(cliente).cls !== "bad" ? LAVADO_EXTRA_PLAN_TIPO : "Lavado único",
        fecha: ahora,
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
        ...pago.documento,
        viaCupon: !!cuponDescuentoVigente,
        cuponCodigo: cuponDescuentoVigente?.codigo,
      };
      const ok = await commit({
        ...patch,
        ventas: [venta, ...data.ventas],
        ...(cuponDescuentoVigente
          ? {
              cupones: data.cupones.map((x) =>
                x.id === cuponDescuentoVigente.id
                  ? marcarDescuentoUsado(cuponDescuentoVigente, cliente.patente, ui.perfilActual?.nombre, ahora)
                  : x
              ),
            }
          : {}),
      });
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO_INGRESO);
        return;
      }
      clearPlate();
      patchUi({ operResult: null });
    };
    // Con un cupón de 100% el precio queda en $0: el cliente no está pagando
    // nada, así que no corresponde pedirle un método de pago (ver el mismo
    // criterio en movimientoContableDesdeVenta, que tampoco genera un
    // movimiento contable para esta venta).
    if (precio <= 0) {
      confirmarCobro({ metodo: undefined });
      return;
    }
    patchUi({
      modal: {
        type: "pago",
        monto: precio,
        descripcion: `Lavado único para ${cliente.nombre} (${cliente.patente})`,
        onConfirm: confirmarCobro,
        cliente,
      },
    });
  };

  const registrarLavadoWeb = async (cliente: Cliente = c) => {
    if (!lavadoWebPendiente) return;
    const patch = registrarIngresoLavadoWeb(data, cliente, lavadoWebPendiente, ui.perfilActual?.nombre);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrarPagado = (cliente: Cliente = c) => {
    if (yaIngresoHoy(data.ingresos, cliente.id)) {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `Este cliente ya pasó una vez hoy. ¿Desea que pase nuevamente por garantía?`,
          confirmLabel: "Sí, ingresar por garantía",
          danger: false,
          onConfirm: () => hacerRegistro(true, cliente),
        },
      });
      return;
    }
    cobrarLavadoUnico(cliente);
  };

  // Solo túnel, sin aspirado (ver SOLO_TUNEL_KEY): cobra y da ingreso, como
  // el lavado único pero a su propio precio. El único cupón que lo rebaja es
  // el de primera vez del bot (cuponSoloTunel, ver cuponValeEnSoloTunel); el
  // resto de los descuentos de la patente son para el Lavado Full Túnel.
  const cobrarSoloTunel = (cliente: Cliente) => {
    if (precioSoloTunel(data.precios) <= 0) return;
    const precio = precioSoloTunelFinal;
    patchUi({
      modal: {
        type: "pago",
        monto: precio,
        descripcion: `Solo túnel (sin aspirado) para ${cliente.nombre} (${cliente.patente})${cuponSoloTunel ? ` con el código ${cuponSoloTunel.codigo}` : ""}`,
        cliente,
        onConfirm: async (pago: PagoInfo) => {
          const ahora = new Date().toISOString();
          const venta: Venta = {
            id: uidVenta(),
            clienteId: cliente.id,
            patente: cliente.patente,
            nombre: cliente.nombre,
            plan: cliente.plan || "",
            precio,
            tipo: SOLO_TUNEL_KEY,
            fecha: ahora,
            creadoPor: ui.perfilActual?.nombre || "",
            metodoPago: pago.metodo,
            voucher: pago.voucher,
            ...pago.documento,
            viaCupon: !!cuponSoloTunel,
            cuponCodigo: cuponSoloTunel?.codigo,
          };
          const patch = registrarIngreso(data, cliente, ui.perfilActual?.nombre);
          const ok = await commit({
            ...patch,
            ventas: [venta, ...data.ventas],
            ...(cuponSoloTunel
              ? {
                  cupones: data.cupones.map((x) =>
                    x.id === cuponSoloTunel.id ? marcarDescuentoUsado(cuponSoloTunel, cliente.patente, ui.perfilActual?.nombre, ahora) : x
                  ),
                }
              : {}),
          });
          if (!ok) {
            setGuardarErr(ERROR_GUARDADO_INGRESO);
            return;
          }
          clearPlate();
          patchUi({ operResult: null });
        },
      },
    });
  };

  // Pack de lavados en el mesón (Promo 2 o 5 Lavados, ver PROMOS_LAVADOS):
  // cobra, deja la Venta y entrega los tickets con el primero ya canjeado —
  // el auto entra ahora (ver entregarPromoLavados), salvo que ya haya pasado
  // hoy o tenga el plan vigente (entra con su plan): ahí se lleva todos los
  // tickets sin usar. El cupón de descuento de la patente no se le resta: ya
  // es una promoción.
  const cobrarPromoLavados = (cliente: Cliente, promo: IdPromoLavados) => {
    const precio = precioPromoLavados(data.precios, promo);
    if (precio <= 0) return;
    const conPlan = planStatus(cliente).cls !== "bad";
    const yaPasoHoy = yaIngresoHoy(data.ingresos, cliente.id);
    patchUi({
      modal: {
        type: "pago",
        monto: precio,
        descripcion:
          `Promo ${PROMOS_LAVADOS[promo].lavados} lavados para ${cliente.nombre} (${cliente.patente})` +
          (conPlan ? " — tiene plan, se lleva todos para después" : yaPasoHoy ? " — ya pasó hoy, se lleva todos para después" : ""),
        cliente,
        onConfirm: async (pago: PagoInfo) => {
          const venta: Venta = {
            id: uidVenta(),
            clienteId: cliente.id,
            patente: cliente.patente,
            nombre: cliente.nombre,
            plan: cliente.plan || "",
            precio,
            tipo: PROMOS_LAVADOS[promo].key,
            fecha: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || "",
            metodoPago: pago.metodo,
            voucher: pago.voucher,
            ...pago.documento,
          };
          const patch = entregarPromoLavados(data, cliente, precio, ui.perfilActual?.nombre, promo, yaPasoHoy || conPlan);
          const ok = await commit({ ...patch, ventas: [venta, ...data.ventas] });
          if (!ok) {
            setGuardarErr(ERROR_GUARDADO_INGRESO);
            return;
          }
          clearPlate();
          patchUi({ operResult: null });
        },
      },
    });
  };

  // Promo 5 Tickets VIP (ver PROMO_VIP_KEY) y Promo 2 Tickets 15 Días (ver
  // PROMO_RECOMPRA_2_KEY): el mismo cobro que un pack; el precio y la ventana
  // ya los resolvió useOperadorFoundResult.
  const cobrarRecompra = (
    cliente: Cliente,
    precio: number,
    tipo: string,
    detalle: string,
    entregar: typeof entregarPromoVip
  ) => {
    if (precio <= 0) return;
    const yaPasoHoy = yaIngresoHoy(data.ingresos, cliente.id);
    patchUi({
      modal: {
        type: "pago",
        monto: precio,
        descripcion:
          `${tipo} para ${cliente.nombre} (${cliente.patente}): ${detalle}` +
          (yaPasoHoy ? " — ya pasó hoy, se lleva todos para después" : ""),
        cliente,
        onConfirm: async (pago: PagoInfo) => {
          const venta: Venta = {
            id: uidVenta(),
            clienteId: cliente.id,
            patente: cliente.patente,
            nombre: cliente.nombre,
            plan: cliente.plan || "",
            precio,
            tipo,
            fecha: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || "",
            metodoPago: pago.metodo,
            voucher: pago.voucher,
            ...pago.documento,
          };
          const patch = entregar(data, cliente, precio, ui.perfilActual?.nombre, yaPasoHoy);
          const ok = await commit({ ...patch, ventas: [venta, ...data.ventas] });
          if (!ok) {
            setGuardarErr(ERROR_GUARDADO_INGRESO);
            return;
          }
          clearPlate();
          patchUi({ operResult: null });
        },
      },
    });
  };

  const cobrarPromoVip = (cliente: Cliente, precio: number) =>
    cobrarRecompra(cliente, precio, PROMO_VIP_KEY, `${TICKETS_VIP_PATENTE} para su auto + 1 libre`, entregarPromoVip);
  const cobrarPromoRecompra2 = (cliente: Cliente, precio: number) =>
    cobrarRecompra(cliente, precio, PROMO_RECOMPRA_2_KEY, "2 lavados para su auto", entregarPromoRecompra2);

  // Upgrade a Promo 4 Lavados (ver UPGRADE_PACK_KEY): cobra el adicional y
  // deja los 3 tickets que le faltan al lavado único que ya pagó. Sin
  // cupón, como los packs.
  const cobrarUpgradePack = (cliente: Cliente, upgrade: { precio: number; lavado: Venta }) => {
    patchUi({
      modal: {
        type: "pago",
        monto: upgrade.precio,
        descripcion: `${TICKETS_UPGRADE_PACK} lavados más (Promo 4 lavados) para ${cliente.nombre} (${cliente.patente})`,
        cliente,
        onConfirm: async (pago: PagoInfo) => {
          const venta: Venta = {
            id: uidVenta(),
            clienteId: cliente.id,
            patente: cliente.patente,
            nombre: cliente.nombre,
            plan: cliente.plan || "",
            precio: upgrade.precio,
            tipo: UPGRADE_PACK_KEY,
            fecha: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || "",
            metodoPago: pago.metodo,
            voucher: pago.voucher,
            ...pago.documento,
          };
          const patch = entregarUpgradePack(data, cliente, upgrade.lavado, upgrade.precio, ui.perfilActual?.nombre);
          const ok = await commit({ ...patch, ventas: [venta, ...data.ventas] });
          if (!ok) {
            setGuardarErr(ERROR_GUARDADO_INGRESO);
            return;
          }
          clearPlate();
          patchUi({ operResult: null });
        },
      },
    });
  };

  // Upgrade del lavado con descuento (ver UPGRADE_DESCUENTO_KEY): el mismo
  // cobro que cobrarUpgradePack, pero deja una Promo 2 Lavados entera.
  const cobrarUpgradeDescuento = (cliente: Cliente, upgrade: { precio: number; lavado: Venta }) => {
    patchUi({
      modal: {
        type: "pago",
        monto: upgrade.precio,
        descripcion: `${TICKETS_UPGRADE_DESCUENTO} lavados más (lavado con descuento) para ${cliente.nombre} (${cliente.patente})`,
        cliente,
        onConfirm: async (pago: PagoInfo) => {
          const venta: Venta = {
            id: uidVenta(),
            clienteId: cliente.id,
            patente: cliente.patente,
            nombre: cliente.nombre,
            plan: cliente.plan || "",
            precio: upgrade.precio,
            tipo: UPGRADE_DESCUENTO_KEY,
            fecha: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || "",
            metodoPago: pago.metodo,
            voucher: pago.voucher,
            ...pago.documento,
          };
          const patch = entregarUpgradeDescuento(data, cliente, upgrade.lavado, upgrade.precio, ui.perfilActual?.nombre);
          const ok = await commit({ ...patch, ventas: [venta, ...data.ventas] });
          if (!ok) {
            setGuardarErr(ERROR_GUARDADO_INGRESO);
            return;
          }
          clearPlate();
          patchUi({ operResult: null });
        },
      },
    });
  };

  // Canje sin código de un ticket que autoriza a esta patente (Promo 2
  // Lavados, Pack de Tickets con flota — ver ticketsVigentesDePatente): el
  // mismo registro que el canje por código del panel (registrarIngresoCupon).
  const usarTicket = async (cliente: Cliente, ticketEnMemoria: Cupon) => {
    // La lista sale de la copia del mesón: el dueño del pack pudo haber sacado
    // esta patente de la regla desde Mi Cuenta (ver conReglaVigente).
    if (patenteYaPasoHoy(data.ingresos, cliente.patente)) {
      setGuardarErr(MSG_TICKET_YA_PASO_HOY);
      return;
    }
    const ticket = await conReglaVigente(ticketEnMemoria);
    if (!patenteAutorizadaParaCupon(ticket, cliente.patente)) {
      setGuardarErr("Este ticket ya no está autorizado para esta patente: el dueño del pack cambió la regla");
      return;
    }
    const ok = await commit(registrarIngresoCupon(data, cliente, ticket, ui.perfilActual?.nombre));
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  return {
    registrar,
    registrarDetailing,
    registrarLavadoWeb,
    registrarPagado,
    cobrarLavadoUnico,
    cobrarSoloTunel,
    cobrarPromoLavados,
    cobrarUpgradePack,
    cobrarUpgradeDescuento,
    cobrarPromoVip,
    cobrarPromoRecompra2,
    usarTicket,
  };
}
