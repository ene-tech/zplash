import type { Cliente, ConfigGlobal, Ingreso, Precios, Venta } from "@/types";
import { PLANES } from "./precios";
import { diasVencido, planStatus } from "./clientes";
import { visitasUltimoPeriodoVencido } from "./ingresos";
import { precioNormal, precioRenovacionLocal, precioReactivacionVencido, precioUpgradePlan, ventaUpgradeElegible } from "./precios";

export interface OfertaPlan {
  renovacionAnticipada?: { pNormal: number; pPromo: number; ahorro: number; diasRestantes?: number };
  reactivacion?: { precio: number; diasVencido: number };
  upgrade?: { precio: number };
}

/**
 * Las mismas 3 promociones de plan que el módulo Operador le ofrece a un
 * cliente presencial (ver OperadorFoundOfertas/useOperadorFoundResult),
 * calculadas como función pura para poder reusarlas tanto al armar la
 * respuesta de Mi Cuenta (qué mostrar) como al crear el cobro en
 * /api/pagos/webpay/crear (qué cobrar realmente) — ahí se vuelve a llamar
 * con datos frescos, nunca se confía en la oferta que el cliente vio en
 * pantalla.
 *
 * A diferencia de `showOffer` en useOperadorFoundResult, acá NO se excluye
 * por `cliente.origen === "WEB"`: esa exclusión existía solo para no
 * duplicarle al Operador una oferta que el cliente Web ya podía ver en
 * /pagar — este es justamente el lugar donde se le ofrece.
 */
export function calcularOfertasPlan(
  cliente: Pick<Cliente, "id" | "plan" | "vencimiento" | "visitas">,
  ventasCliente: Venta[],
  ingresosCliente: Ingreso[],
  config: ConfigGlobal,
  precios: Precios
): OfertaPlan {
  const plan = cliente.plan || PLANES[0];
  const st = planStatus(cliente);
  const oferta: OfertaPlan = {};

  // Renovación anticipada: igual que el Operador, el plan puede renovarse
  // cuando quiera mientras no esté vencido — renovarPlan ancla la nueva
  // vigencia al vencimiento actual si todavía no pasó, así que renovar
  // temprano no le hace perder días.
  if (st.cls !== "bad") {
    const pNormal = precioNormal(precios, plan);
    if (pNormal > 0) {
      const pPromo = precioRenovacionLocal(config, precios, plan, cliente.visitas || 0);
      oferta.renovacionAnticipada = { pNormal, pPromo, ahorro: pNormal - pPromo, diasRestantes: st.diasRestantes };
    }
  }

  // Reactivación: plan vencido hace poco, con un tramo que calce por días
  // vencido + visitas del último período vigente.
  const diasVenc = diasVencido(cliente);
  if (diasVenc !== null) {
    const visitasUltPeriodo = visitasUltimoPeriodoVencido(ingresosCliente, cliente);
    const precioReactivacion = precioReactivacionVencido(config, plan, diasVenc, visitasUltPeriodo);
    if (precioReactivacion !== undefined) {
      oferta.reactivacion = { precio: precioReactivacion, diasVencido: diasVenc };
    }
  }

  // Upgrade a plan: compró un "Lavado único" hace poco y sigue sin plan vigente.
  if (st.cls === "bad") {
    const ventaUpgrade = ventaUpgradeElegible(ventasCliente, cliente.id, config.horasVentanaUpgradePlan);
    if (ventaUpgrade) {
      oferta.upgrade = { precio: precioUpgradePlan(precios) };
    }
  }

  return oferta;
}
