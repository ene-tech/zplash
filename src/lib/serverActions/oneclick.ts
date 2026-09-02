"use server";

import * as dataAccess from "@/lib/dataAccess";
import type { SuscripcionOneclickInfo } from "@/lib/dataAccess";
import { tieneTarjetaViva } from "@/lib/helpers";
import { buscarCliente, evaluarReglasCorreoPorSuscripcionCancelada } from "@/lib/mailing/reglas";
import { cancelarSuscripcionWooCommerceLegacy, cobrarSuscripcion } from "@/lib/pagos";
import { tieneModulo } from "@/lib/session";

export async function obtenerSuscripcionOneclick(patente: string): Promise<SuscripcionOneclickInfo | null> {
  if (!(await tieneModulo("clientes"))) return null;
  return dataAccess.obtenerSuscripcionOneclick(patente);
}

// Cobro manual del ciclo, disparado desde ClienteInfoModal o desde Admin →
// Suscripciones. Sirve tanto para reintentar un rechazo como para cobrar a un
// cliente vencido cuyo cobro automático nunca llegó a ejecutarse. Usa la misma
// cobrarSuscripcion() que el cron diario — si el ciclo del mes ya se cobró y
// quedó aprobado, lanza y el modal muestra el error.
// "pendiente_validacion" = el cliente sigue en el ilimitado viejo y no ha
// aceptado pasar al X5, así que no se le cobró nada (ver requiereValidacionX5):
// ni siquiera a mano se le puede forzar el cambio de plan desde acá.
export async function cobrarSuscripcionManual(
  suscripcionId: string
): Promise<{ estado: "aprobada" | "rechazada" | "pendiente_validacion" } | null> {
  if (!(await tieneModulo("clientes"))) return null;
  const suscripcion = await dataAccess.obtenerSuscripcionOneclickPorId(suscripcionId);
  if (!suscripcion) return null;
  return cobrarSuscripcion(suscripcion);
}

// Listado completo para la pestaña Admin → Suscripciones (a diferencia de
// obtenerSuscripcionOneclick, que trae solo la de un cliente puntual).
export async function listarSuscripcionesOneclick(): Promise<SuscripcionOneclickInfo[]> {
  if (!(await tieneModulo("clientes"))) return [];
  return dataAccess.listarSuscripcionesOneclick();
}

export async function cancelarSuscripcionOneclick(id: string): Promise<boolean> {
  if (!(await tieneModulo("clientes"))) return false;
  return dataAccess.cancelarSuscripcionOneclick(id);
}

export async function suspenderSuscripcionOneclick(id: string): Promise<boolean> {
  if (!(await tieneModulo("clientes"))) return false;
  return dataAccess.suspenderSuscripcionOneclick(id);
}

export async function reactivarSuscripcionOneclick(id: string): Promise<boolean> {
  if (!(await tieneModulo("clientes"))) return false;
  return dataAccess.reactivarSuscripcionOneclick(id);
}

/**
 * "Cancelar suscripción" de la ficha de cliente (ClienteInfoModal): corta el
 * cobro automático por los DOS frentes que puede tener un cliente —el Oneclick
 * propio y la suscripción vieja de WooCommerce que muchos todavía arrastran
 * (ver renovacionAutoWooDesde)— y le manda el correo de respaldo. Cortar solo
 * uno lo deja igual de cobrado por el otro.
 *
 * A propósito NO usa cancelarSuscripcionOneclick (la de "Eliminar tarjeta" en
 * Mi Cuenta): esa da de baja la inscripción en Transbank y obliga al cliente a
 * reinscribir su tarjeta si algún día vuelve. Acá basta con dejar de cobrar
 * —el cron (/api/pagos/oneclick/cobrar) solo toca estado "activa"—, así la
 * tarjeta le queda guardada en su cuenta y volver es un clic.
 */
export async function anularSuscripcion(clienteId: string): Promise<{ oneclick: boolean; woo: boolean } | null> {
  if (!(await tieneModulo("clientes"))) return null;
  const cliente = await buscarCliente(clienteId);
  if (!cliente) return null;

  const suscripcion = await dataAccess.obtenerSuscripcionOneclick(cliente.patente);
  const oneclick = !!suscripcion && tieneTarjetaViva(suscripcion.estado);
  if (suscripcion && oneclick) await dataAccess.suspenderSuscripcionOneclick(suscripcion.id);

  // Best-effort, mismo criterio que /inscripcion/retorno: si WooCommerce falla
  // (permisos de la key, staging lock) no se pierde la anulación local, pero
  // queda loggeado fuerte — una suscripción viva allá es un cobro más al
  // cliente que acaba de pedir que le dejen de cobrar.
  let woo = false;
  if (cliente.renovacionAutoWooDesde) {
    woo = await cancelarSuscripcionWooCommerceLegacy(cliente.patente, cliente.email || "")
      .then(({ cancelada }) => cancelada)
      .catch((error) => {
        console.error(`ERROR cancelando la suscripción de WooCommerce de ${cliente.patente} al anularla desde la ficha — revisar a mano`, error);
        return false;
      });
  }

  await evaluarReglasCorreoPorSuscripcionCancelada(cliente);
  return { oneclick, woo };
}
