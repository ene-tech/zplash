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
  planStatus,
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
  const showOffer = st.cls === "warn" && pNormal > 0 && c.origen !== "WEB";
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

  // Servicio con pasada libre por el túnel (Lavado Completo Detailing o un
  // add-on de chasis, ver esServicioTunelLibre) vendido en Servicios
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
    // Si ya existe un Ingreso ligado a esta cita, el paso por el túnel ya
    // quedó registrado (ver registrarIngresoDetailing en @/lib/actions): no
    // volver a ofrecer el botón para no invitar a un doble check-in del
    // mismo vehículo.
    if (data.ingresos.some((i) => i.citaId === cita.id)) return false;
    return cita.servicioIds.some((id) => {
      const s = data.servicios.find((sv) => sv.id === id);
      return s ? esServicioTunelLibre(s) : false;
    });
  });

  const updateResult = (updated: Cliente) => patchUi({ operResult: { found: true, cliente: updated } });

  const ingreso = useIngresoActions(c, clearPlate, setGuardarErr, { estadoIngreso, citaDetailingPendiente, cuponDescuentoVigente });
  const plan = usePlanActions(c, setGuardarErr, updateResult, {
    pPromo,
    precioReactivacion,
    precioOfertaWeb,
    precioUpgrade,
    ventaUpgrade,
  });
  const ficha = useFichaClienteActions(c, refs, setGuardarErr, updateResult);

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
    citaDetailingPendiente,
    ...ingreso,
    ...plan,
    ...ficha,
  };
}
