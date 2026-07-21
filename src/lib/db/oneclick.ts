"use server";

import * as dataAccess from "@/lib/dataAccess";
import type { SuscripcionOneclickInfo } from "@/lib/dataAccess";
import { cobrarSuscripcion } from "@/lib/pagos";
import { tieneModulo } from "@/lib/session";

export async function obtenerSuscripcionOneclick(patente: string): Promise<SuscripcionOneclickInfo | null> {
  if (!(await tieneModulo("clientes"))) return null;
  return dataAccess.obtenerSuscripcionOneclick(patente);
}

// Reintento manual de un cobro rechazado, disparado desde ClienteInfoModal.
// Usa la misma cobrarSuscripcion() que el cron diario — si el ciclo del mes
// ya se cobró (aprobado o rechazado), lanza y el modal muestra el error.
export async function cobrarSuscripcionManual(suscripcionId: string): Promise<{ estado: "aprobada" | "rechazada" } | null> {
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
