"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { puedeIngresarTunelDetailing } from "@/lib/agenda";
import {
  diasVencido,
  esExentoBloqueoReingreso,
  esExentoValidacionRegistroOperador,
  esNombreVacio,
  esServicioTunelLibre,
  estadoReingresoPlan,
  isValidTelefono,
  MAX_INGRESOS_TUNEL_DETAILING_POR_CITA,
  montoDescuento,
  planStatus,
  precioLavadoUnico,
  precioNormal,
  precioReactivacionVencido,
  precioRenovacionLocal,
  precioUpgradePlan,
  ventaUpgradeElegible,
  visitasUltimoPeriodoVencido,
} from "@/lib/helpers";
import type { Cliente } from "@/types";
import { useFichaClienteActions } from "./useFichaClienteActions";
import { useIngresoActions } from "./useIngresoActions";
import { usePlanActions } from "./usePlanActions";

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
// reingreso) y delega las acciones a tres hooks por dominio: ficha del
// cliente (useFichaClienteActions), dar ingreso (useIngresoActions) y
// planes/promociones (usePlanActions). Los refs de los inputs se crean en el
// componente (no acá) y se pasan por parámetro: si el objeto que retorna
// este hook incluyera refs, el linter de React Compiler marca cualquier
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
  const pNormal = precioNormal(data.precios, c.plan || "");
  const pPromo = precioRenovacionLocal(data.config, data.precios, c.plan || "", c.visitas || 0);
  // El cliente puede renovar cuando quiera, no solo cuando el plan está por
  // vencer: renovarPlan ya ancla la nueva vigencia al vencimiento actual si
  // todavía no pasó (ver lib/logic/ingresos.ts), así que renovar temprano no
  // le hace perder días. Solo se excluye "bad" (vencido/sin plan), que tiene
  // su propia oferta de reactivación (showReactivacion/esWebVencido).
  const showOffer = st.cls !== "bad" && pNormal > 0 && c.origen !== "WEB";
  const ahorro = pNormal - pPromo;
  const planVigente = st.cls !== "bad";
  // "Administración" y "Gerencia" pueden forzar el ingreso aunque el
  // reingreso esté bloqueado (cliente pasó hace menos de 24:30 horas): se
  // trata como "garantia" para que quede la misma confirmación y quede
  // registrado sin cobrar de nuevo (ver esExentoBloqueoReingreso).
  const exentoBloqueoReingreso = esExentoBloqueoReingreso(ui.perfilActual?.modulos || [], ui.perfilActual?.nombre);
  const horasBloqueoReingreso = data.config.horasBloqueoReingresoPlan;
  const estadoIngresoBruto = estadoReingresoPlan(data.ingresos, c.id, new Date(), horasBloqueoReingreso);
  const estadoIngreso = estadoIngresoBruto === "bloqueado" && exentoBloqueoReingreso ? "garantia" : estadoIngresoBruto;

  const esWebVencido = c.origen === "WEB" && st.cls === "bad";
  const ventasCliente = data.ventas
    .filter((v) => v.clienteId === c.id)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  const precioOfertaWeb = ventasCliente.length ? ventasCliente[0].precio : pNormal;

  // Promoción: reactivación preferencial para un cliente (Local o Web) con
  // el plan vencido hace poco, escalonada por hace cuánto venció y cuántas
  // veces pasó durante su último período de plan pagado (ver
  // tramosReactivacionVencido/precioReactivacionVencido). undefined =
  // ningún tramo calza, no corresponde ofrecerla — en ese caso un cliente
  // Web sigue viendo su oferta genérica (esWebVencido, más abajo).
  const diasVenc = diasVencido(c);
  const visitasUltPeriodo = visitasUltimoPeriodoVencido(data.ingresos, c);
  const precioReactivacion =
    diasVenc !== null ? precioReactivacionVencido(data.config, c.plan || "", diasVenc, visitasUltPeriodo) : undefined;
  const showReactivacion = precioReactivacion !== undefined;

  // Promoción: si al cliente se le acaba de cobrar un lavado único (dentro de
  // la ventana configurada, ver ventaUpgradeElegible) y sigue sin plan
  // vigente, se le puede ofrecer quedar con el Plan Ilimitado Mensual pagando
  // solo el adicional — ver usePlanActions.upgradeAPlan.
  const horasVentanaUpgrade = data.config.horasVentanaUpgradePlan;
  const ventaUpgrade = !planVigente ? ventaUpgradeElegible(data.ventas, c.id, horasVentanaUpgrade) : undefined;
  const precioUpgrade = precioUpgradePlan(data.precios);

  // Descuento generado por una regla de WhatsApp (ver @/lib/whatsapp/reglas)
  // tras una venta anterior de este vehículo — se reconoce solo por patente,
  // sin que el operador tenga que tipear ningún código (a diferencia del
  // cupón manual que sí se pide en OperadorNotFoundResult). Se aplica al
  // cobrar el Lavado Full Túnel (ver useIngresoActions.cobrarLavadoUnico).
  const cuponDescuentoVigente = data.cupones.find(
    (cup) => cup.tipo === "descuento" && !cup.usado && cup.patenteAsignada === c.patente && new Date(cup.fechaCaducidad) > new Date()
  );
  const precioBaseLavadoUnico = precioLavadoUnico(data.precios);
  const precioLavadoUnicoFinal = cuponDescuentoVigente
    ? Math.max(0, precioBaseLavadoUnico - montoDescuento(cuponDescuentoVigente, precioBaseLavadoUnico))
    : precioBaseLavadoUnico;

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

  const updateResult = (updated: Cliente) => patchUi({ operResult: { found: true, cliente: updated } });

  const ingreso = useIngresoActions(c, clearPlate, setGuardarErr, {
    estadoIngreso,
    citaDetailingPendiente,
    cuponDescuentoVigente,
    precioLavadoUnicoFinal,
  });
  const plan = usePlanActions(c, setGuardarErr, updateResult, {
    pPromo,
    precioReactivacion,
    precioOfertaWeb,
    precioUpgrade,
    ventaUpgrade,
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
    horasBloqueoReingreso,
    showOffer,
    pNormal,
    pPromo,
    ahorro,
    showReactivacion,
    diasVenc,
    precioReactivacion,
    esWebVencido,
    precioOfertaWeb,
    ventaUpgrade,
    precioUpgrade,
    horasVentanaUpgrade,
    cuponDescuentoVigente,
    precioLavadoUnicoFinal,
    citaDetailingPendiente,
    ...ingreso,
    ...plan,
    ...ficha,
    registrar: conFichaCompleta(ingreso.registrar),
    registrarPagado: conFichaCompleta(ingreso.registrarPagado),
    cobrarLavadoUnico: conFichaCompleta(ingreso.cobrarLavadoUnico),
    registrarDetailing: conFichaCompleta(ingreso.registrarDetailing),
    contratarPlan: conFichaCompleta(plan.contratarPlan),
    renovar: conFichaCompleta(plan.renovar),
    reactivar: conFichaCompleta(plan.reactivar),
    renovarWeb: conFichaCompleta(plan.renovarWeb),
    upgradeAPlan: conFichaCompleta(plan.upgradeAPlan),
  };
}
