"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { puedeIngresarTunelDetailing } from "@/lib/agenda";
import {
  esExentoBloqueoReingreso,
  esExentoValidacionRegistroOperador,
  esNombreVacio,
  esServicioTunelLibre,
  estadoReingresoPlan,
  pasesRestantes,
  type EstadoReingresoPlan,
  isValidTelefono,
  MAX_INGRESOS_TUNEL_DETAILING_POR_CITA,
  cuponDescuentoDePatente,
  precioConCupon,
  precioPlanOneclick,
  promoPrimerCobroOneclick,
  calcularOfertasPlan,
  precioRenovacionCliente,
  PLANES,
  planStatus,
  precioConHeredado,
  precioLavadoAdicional,
  precioLavadoUnico,
  precioPromoLavados,
  precioRenovacionATiempo,
  precioRenovacionLocal,
  ticketsVigentesDePatente,
  ventaLavadoWebPendiente,
  visitasPeriodoPlan,
} from "@/lib/helpers";
import type { Cliente } from "@/types";
import { useFichaClienteActions } from "./useFichaClienteActions";
import { useIngresoActions } from "./useIngresoActions";

export const ERROR_GUARDADO_INGRESO =
  "No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.";

type FoundResultRefs = {
  nombreRef: RefObject<HTMLInputElement | null>;
  vehiculoRef: RefObject<HTMLInputElement | null>;
  telefonoRef: RefObject<HTMLInputElement | null>;
  emailRef: RefObject<HTMLInputElement | null>;
};

// Calcula todos los valores derivados del resultado "cliente encontrado" del
// Operador (estado del plan, ofertas/promociones aplicables, bloqueo de
// reingreso) y delega las acciones a dos hooks por dominio: ficha del
// cliente (useFichaClienteActions) y dar ingreso (useIngresoActions). Los
// refs de los inputs se crean en el componente (no acá) y se pasan por
// parámetro: si el objeto que retorna este hook incluyera refs, el linter de React Compiler marca cualquier
// lectura de sus otras propiedades durante el render como "acceso a ref"
// (no distingue qué campo del bag es cuál).
export function useOperadorFoundResult(cliente: Cliente, clearPlate: () => void, refs: FoundResultRefs) {
  const { data, ui, patchUi } = useApp();
  const [guardarErr, setGuardarErr] = useState("");

  const c = cliente;
  const exentoValidacion = esExentoValidacionRegistroOperador(ui.perfilActual?.modulos || [], ui.perfilActual?.nombre);
  const registroIncompleto =
    esNombreVacio(c.nombre) || (!exentoValidacion && (!c.telefono || !isValidTelefono(c.telefono) || !c.email));
  const st = planStatus(c);
  // El Plan X5 se vende solo por la web (oct-2026, ver OperadorFoundOfertas):
  // acá no se cobra ningún plan, solo se le cuenta al cliente lo que le sale
  // online. pNormal es el precio tachado de referencia, con su heredado.
  const pNormal = precioRenovacionATiempo(data.precios, c.plan || PLANES[0], c);
  // Al que ya paga por la web no hay nada que ofrecerle: se le renueva solo.
  const showOffer = st.cls !== "bad" && pNormal > 0 && c.origen !== "WEB";
  // Promoción de renovación anticipada del canal Web, escalonada por cuántas
  // veces pasó en su período (ver precioRenovacionLocal): se le avisa para que
  // la tome en su cuenta antes de que se le venza.
  const visitasPeriodo = visitasPeriodoPlan(data.ingresos, c);
  const pPromoWeb = precioRenovacionLocal(data.config, data.precios, c.plan || PLANES[0], visitasPeriodo, "WEB");
  const showRenovacionSoloWeb = showOffer && pPromoWeb !== undefined && pPromoWeb < pNormal;
  const planVigente = st.cls !== "bad";
  // "Administración" y "Gerencia" pueden forzar el ingreso aunque el
  // reingreso esté bloqueado (cliente pasó hace menos de 24:30 horas): se
  // trata como "garantia" para que quede la misma confirmación y quede
  // registrado sin cobrar de nuevo (ver esExentoBloqueoReingreso).
  const exentoBloqueoReingreso = esExentoBloqueoReingreso(ui.perfilActual?.modulos || [], ui.perfilActual?.nombre);
  const horasBloqueoReingreso = data.config.horasBloqueoReingresoPlan;
  const estadoIngresoBruto = estadoReingresoPlan(data.ingresos, c.id, new Date(), horasBloqueoReingreso);
  // Pasadas que le quedan en el ciclo (null = plan sin tope, o sea el
  // ilimitado viejo y los que no tienen plan — ver pasesIncluidos). Agotadas,
  // pesa más que el bloqueo por horas: da lo mismo cuándo pasó la última vez
  // si ya no le quedan.
  const pasesQueQuedan = pasesRestantes(data.ingresos, c);
  const estadoIngreso: EstadoReingresoPlan =
    pasesQueQuedan === 0 && estadoIngresoBruto !== "garantia"
      ? "sin_pases"
      : estadoIngresoBruto === "bloqueado" && exentoBloqueoReingreso
        ? "garantia"
        : estadoIngresoBruto;

  // Descuento generado por una regla de WhatsApp (ver @/lib/whatsapp/reglas)
  // tras una venta anterior de este vehículo — se reconoce solo por patente,
  // sin que el operador tenga que tipear ningún código (a diferencia del
  // cupón manual que sí se pide en OperadorNotFoundResult). Se aplica al Lavado
  // Full Túnel (ver useIngresoActions.cobrarLavadoUnico).
  const cuponDescuentoVigente = cuponDescuentoDePatente(data.cupones, c.patente, "local");
  // El descuento que esta patente TIENE pero el mesón NO puede aplicar: es de
  // canal "web" (ver cuponValeEnCanal). No rebaja ningún precio de esta
  // pantalla — se muestra arriba de todo para que el operador se lo ofrezca
  // como el motivo para contratar por la web. Se compara por id y no con un
  // simple `else`: si además tiene uno cobrable acá, el de la web sigue
  // valiendo la pena mencionarlo cuando es otro cupón.
  const cuponWeb = cuponDescuentoDePatente(data.cupones, c.patente, "web");
  const cuponDescuentoSoloWeb = cuponWeb && cuponWeb.id !== cuponDescuentoVigente?.id ? cuponWeb : undefined;
  // Cuánto termina pagando el cliente si contrata por la web con ese cupón:
  // el operador tiene que poder decirle el monto final, no solo cuánto se
  // ahorra. Sale de la MISMA oferta que el cliente va a ver en Mi Cuenta
  // (calcularOfertasPlan, canal WEB por defecto) para que el mesón no anuncie
  // un número y la web cobre otro; sin ninguna oferta de plan (típicamente el
  // que nunca contrató) queda el precio con que /pagar cobra el plan (ver
  // precioRenovacionCliente). El cupón se resta acá, igual que lo hace
  // /api/pagos/webpay/crear sobre el ítem de plan.
  const ofertaWeb = cuponDescuentoSoloWeb
    ? calcularOfertasPlan(c, data.ventas, data.ingresos, data.config, data.precios)
    : undefined;
  const precioPlanWeb =
    ofertaWeb && cuponDescuentoSoloWeb
      ? precioConCupon(
          ofertaWeb.reactivacion?.precio ??
            ofertaWeb.pagoVencido?.precio ??
            ofertaWeb.upgrade?.precio ??
            ofertaWeb.renovacionAnticipada?.pPromo ??
            precioRenovacionCliente(data.precios, c.plan || PLANES[0], c, data.config.diasGraciaPagoAtrasado),
          cuponDescuentoSoloWeb
        )
      : undefined;
  // Lo que le cobra el QR de "pagar con tarjeta" (inscripción Oneclick en
  // /pagar): mismo cálculo que /api/pagos/estado para precioPrimerCobroAuto —
  // la promo que le calce o el mensual automático, menos el cupón web — para
  // que el operador anuncie el número que el cliente va a ver en su celular.
  // Con el plan vigente no hay promo de primer cobro: inscribe la tarjeta y
  // se le cobra el mensual recién al vencer.
  const qrMensual = precioConHeredado(precioPlanOneclick(data.precios), c);
  const qrPromo = !planVigente
    ? promoPrimerCobroOneclick(calcularOfertasPlan(c, data.ventas, data.ingresos, data.config, data.precios))
    : undefined;
  const qrPrimer = precioConCupon(qrPromo?.monto ?? qrMensual, cuponWeb);
  const precioQrTarjeta = { primerCobro: qrPrimer > 0 ? qrPrimer : qrMensual, mensual: qrMensual };
  // Al cliente con plan vigente que ya gastó las pasadas de su ciclo (ver
  // pasesRestantes) el paso extra le sale al precio de lavado adicional, no al
  // lavado único de lista: ese sigue siendo el precio de quien no tiene plan.
  const precioBaseLavadoUnico =
    estadoIngreso === "sin_pases" ? precioLavadoAdicional(data.precios) : precioLavadoUnico(data.precios);
  const precioLavadoUnicoFinal = precioConCupon(precioBaseLavadoUnico, cuponDescuentoVigente);

  // Servicio con pasada libre por el túnel (Lavado Completo Detailing o un
  // add-on de motor/chasis, ver esServicioTunelLibre) vendido en Servicios
  // Adicionales (Venta + Cita ya creadas ahí), a la espera de que el
  // vehículo entre físicamente al túnel: se detecta por la Cita del día que
  // incluya alguno de esos servicios y ya esté físicamente en el local
  // (Recibido, En Limpieza o Listo para Entrega) — si sigue "Agendado"
  // todavía no ha llegado, y no se le puede dar ingreso al túnel (ver
  // puedeIngresarTunelDetailing en lib/agenda.ts).
  const citaDetailingPendiente = data.citas.find((cita) => {
    if (cita.clienteId !== c.id) return false;
    if (!puedeIngresarTunelDetailing(cita.estado)) return false;
    if (new Date(cita.fechaHora).toDateString() !== new Date().toDateString()) return false;
    // La cita puede pasar hasta MAX_INGRESOS_TUNEL_DETAILING_POR_CITA veces
    // por el túnel (ver registrarIngresoDetailing en @/lib/logic/ingresos):
    // una vez alcanzado el máximo, no volver a ofrecer el botón para no
    // invitar a un check-in de más del mismo vehículo.
    const pasadasRegistradas = data.ingresos.filter((i) => i.citaId === cita.id).length;
    if (pasadasRegistradas >= MAX_INGRESOS_TUNEL_DETAILING_POR_CITA) return false;
    return cita.servicioIds.some((id) => {
      const s = data.servicios.find((sv) => sv.id === id);
      return s ? esServicioTunelLibre(s) : false;
    });
  });

  // Lavado único comprado por adelantado desde /pagar y todavía sin canjear
  // físicamente (ver ventaLavadoWebPendiente) — mismo patrón que
  // citaDetailingPendiente, pero para una compra suelta en vez de una Cita.
  const lavadoWebPendiente = ventaLavadoWebPendiente(data.ventas, c.id);

  // Tickets que esta patente puede canjear sin código — los de la Promo 2
  // Lavados y los de un Pack de Tickets con flota (ver
  // ticketsVigentesDePatente). Se ofrecen arriba, antes de cobrarle nada.
  const ticketsPatente = ticketsVigentesDePatente(data.cupones, c.patente);
  // $0 = pack apagado: su botón no se muestra (ver precioPromoLavados).
  const precioPromo2 = precioPromoLavados(data.precios, "promo_2_lavados");
  const precioPromo5 = precioPromoLavados(data.precios, "promo_5_lavados");

  const updateResult = (updated: Cliente) => patchUi({ operResult: { found: true, cliente: updated } });

  const ingreso = useIngresoActions(c, clearPlate, setGuardarErr, {
    estadoIngreso,
    citaDetailingPendiente,
    lavadoWebPendiente,
    cuponDescuentoVigente,
    precioLavadoUnicoFinal,
  });
  const ficha = useFichaClienteActions(c, refs, setGuardarErr, updateResult);

  // Envuelve una acción de ingreso/plan para que, si el registro está
  // incompleto, primero intente completarlo y guardarlo con lo que el
  // operador ya dejó tipeado en los inputs de la ficha (ver
  // resolverFichaPendiente): así no hace falta tocar el botón "Guardar" de
  // cada campo antes de poder dar ingreso o vender un plan — basta con
  // completar los datos y tocar directamente la opción deseada (por ejemplo
  // "Lavado Full Túnel ($9.990)"). Si tras eso los datos siguen incompletos
  // o inválidos, se corta acá y se muestra el error en vez de intentar la
  // acción con un cliente sin los datos requeridos.
  const conFichaCompleta = <A extends unknown[]>(accion: (cliente: Cliente, ...args: A) => void | Promise<void>) => {
    return async (...args: A) => {
      if (!registroIncompleto) {
        await accion(c, ...args);
        return;
      }
      const resultado = await ficha.resolverFichaPendiente(exentoValidacion);
      if (!resultado.ok) {
        setGuardarErr(resultado.error);
        return;
      }
      setGuardarErr("");
      await accion(resultado.cliente, ...args);
    };
  };

  return {
    c,
    st,
    guardarErr,
    registroIncompleto,
    planVigente,
    estadoIngreso,
    pasesQueQuedan,
    visitasPeriodo,
    horasBloqueoReingreso,
    showOffer,
    pNormal,
    showRenovacionSoloWeb,
    pPromoWeb,
    cuponDescuentoVigente,
    cuponDescuentoSoloWeb,
    precioPlanWeb,
    precioQrTarjeta,
    perfilId: ui.perfilActual?.id,
    precioLavadoUnicoFinal,
    // Para contarle al cliente que todavía anda con el ilimitado viejo cómo
    // le queda el X5 al renovar (ver AvisoPasaAX5 en OperadorFoundOfertas).
    precioAdicional: precioLavadoAdicional(data.precios),
    citaDetailingPendiente,
    lavadoWebPendiente,
    ticketsPatente,
    precioPromo2,
    precioPromo5,
    ...ingreso,
    ...ficha,
    registrar: conFichaCompleta(ingreso.registrar),
    registrarPagado: conFichaCompleta(ingreso.registrarPagado),
    cobrarLavadoUnico: conFichaCompleta(ingreso.cobrarLavadoUnico),
    cobrarPromoLavados: conFichaCompleta(ingreso.cobrarPromoLavados),
    usarTicket: conFichaCompleta(ingreso.usarTicket),
    registrarDetailing: conFichaCompleta(ingreso.registrarDetailing),
    registrarLavadoWeb: conFichaCompleta(ingreso.registrarLavadoWeb),
  };
}
