import type { CanalPromo, Cliente, ConfigGlobal, Ingreso, Precios, Venta } from "@/types";
import { PLANES } from "./precios";
import { diasVencido, planStatus } from "./clientes";
import { visitasPeriodoPlan, visitasUltimoPeriodoVencido } from "./ingresos";
import {
  precioConHeredado,
  precioNormal,
  precioRenovacionLocal,
  precioReactivacionVencido,
  precioUpgradePlan,
  tramoRenovacionVigente,
  ventaUpgradeElegible,
} from "./precios";

export interface OfertaPlan {
  renovacionAnticipada?: { pNormal: number; pPromo: number; ahorro: number; diasRestantes?: number; tramoVigente: boolean };
  // `pNormal` = lo que va a pagar DESPUÉS: la promoción de reactivación es
  // solo por ese primer mes, la renovación siguiente vale el precio normal
  // (pagándola antes del vencimiento). Va acá porque en un cliente vencido
  // `renovacionAnticipada` no existe y es el único lugar donde el cliente Web
  // puede ver ese valor.
  reactivacion?: { precio: number; diasVencido: number; pNormal: number };
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
 *
 * `canal` es el canal por el que se van a tomar las promociones de renovación
 * anticipada y de reactivación (ver precioRenovacionLocal /
 * precioReactivacionVencido). Por defecto "WEB", que es lo que son todos los
 * llamadores de hoy: Mi Cuenta, /api/pagos/webpay/crear, cobrar-oferta y las
 * reglas de correo de plan vencido — el correo enlaza al pago online, así que
 * un tramo marcado "LOCAL" no se anuncia por ahí.
 */
export function calcularOfertasPlan(
  cliente: Pick<Cliente, "id" | "plan" | "vencimiento" | "fechaContratacion" | "precioPlanHeredado">,
  ventasCliente: Venta[],
  ingresosCliente: Ingreso[],
  config: ConfigGlobal,
  precios: Precios,
  canal: CanalPromo = "WEB"
): OfertaPlan {
  const plan = cliente.plan || PLANES[0];
  const st = planStatus(cliente);
  const oferta: OfertaPlan = {};

  // Renovación anticipada: igual que el Operador, el plan puede renovarse
  // cuando quiera mientras no esté vencido — renovarPlan ancla la nueva
  // vigencia al vencimiento actual si todavía no pasó, así que renovar
  // temprano no le hace perder días.
  //
  // Sin tramo que le calce por canal + pasadas del período vigente no hay
  // promoción y el precio de renovar es el normal (ahorro 0): la oferta igual
  // se arma, para que Mi Cuenta pueda mostrar su recordatorio de vencimiento y
  // cobrar la renovación (ver sinOfertaReal en VehiculoCard).
  if (st.cls !== "bad") {
    // El precio heredado se aplica sobre AMBOS (ver precioConHeredado): quien
    // venía pagando menos renueva a ese valor, y la tarjeta no le inventa un
    // "ahorro" contra un precio de lista que a él nunca le tocó.
    const pNormal = precioConHeredado(precioNormal(precios, plan), cliente);
    if (pNormal > 0) {
      const visitasPeriodo = visitasPeriodoPlan(ingresosCliente, cliente);
      const pPromo = precioConHeredado(precioRenovacionLocal(config, precios, plan, visitasPeriodo, canal) ?? pNormal, cliente);
      oferta.renovacionAnticipada = {
        pNormal,
        pPromo,
        ahorro: pNormal - pPromo,
        diasRestantes: st.diasRestantes,
        tramoVigente: tramoRenovacionVigente(config, plan, visitasPeriodo, canal),
      };
    }
  }

  // Reactivación: plan vencido hace poco, con un tramo que calce por días
  // vencido + visitas del último período vigente y que esté habilitado para
  // este canal.
  const diasVenc = diasVencido(cliente);
  if (diasVenc !== null) {
    const visitasUltPeriodo = visitasUltimoPeriodoVencido(ingresosCliente, cliente);
    const precioReactivacion = precioReactivacionVencido(config, plan, diasVenc, visitasUltPeriodo, canal);
    if (precioReactivacion !== undefined) {
      // pNormal con el heredado aplicado: es lo que se le va a cobrar de
      // verdad en la renovación siguiente (ver el bloque de arriba), no el
      // precio de lista.
      oferta.reactivacion = { precio: precioReactivacion, diasVencido: diasVenc, pNormal: precioConHeredado(precioNormal(precios, plan), cliente) };
    }
  }

  // Upgrade a plan: compró un "Lavado único" hace poco y sigue sin plan vigente.
  if (st.cls === "bad") {
    const ventaUpgrade = ventaUpgradeElegible(ventasCliente, cliente.id, config.horasVentanaUpgradePlan);
    if (ventaUpgrade) {
      oferta.upgrade = { precio: precioUpgradePlan(precios, ventaUpgrade) };
    }
  }

  return oferta;
}
