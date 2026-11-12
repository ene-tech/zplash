"use server";

import * as dataAccess from "@/lib/dataAccess";
import type { DetallePagoVenta } from "@/lib/dataAccess";
import { puedeCerrarCaja, puedeEnviarDocumentosCliente } from "@/lib/helpers";
import {
  cargarComprobanteReembolso,
  htmlComprobanteReembolso,
  reembolsarVentaTarjeta,
  reenviarComprobanteReembolso,
  type ResultadoReembolso,
} from "@/lib/pagos";
import { sesionActual, tieneModulo } from "@/lib/session";

// Detalle real de Transbank (voucher/comprobante) para el historial de
// compras de la ficha de cliente — ver ClienteInfoModal.tsx.
export async function obtenerDetallePagosVentas(ventaIds: string[]): Promise<Record<string, DetallePagoVenta>> {
  if (!(await tieneModulo("clientes"))) return {};
  return dataAccess.listarDetallePagosVentas(ventaIds);
}

// Devolución a la tarjeta de un pago Transbank, desde el historial de compras
// de la ficha de cliente. Mismo gate que deleteVentas (Gerencia o quien puede
// cerrar caja): devolver plata es tan destructivo como borrar la venta.
// `monto` permite una devolución parcial; sin él se devuelve todo. El tope
// real se valida adentro contra lo cobrado por Transbank, no contra la UI.
// `anularVigencia`: además quitarle al cliente el mes que dio esa venta de plan.
export async function reembolsarVenta(
  ventaId: string,
  motivo: string,
  monto?: number,
  anularVigencia = false
): Promise<ResultadoReembolso> {
  const sesion = await sesionActual();
  if (!sesion || !(sesion.modulos.includes("permisos") || puedeCerrarCaja(sesion.modulos))) {
    return { ok: false, error: "Necesitas permisos de Gerencia o de cierre de caja para reembolsar." };
  }
  if (!motivo.trim()) return { ok: false, error: "Escribe el motivo del reembolso." };
  // El contra-asiento se registra con fecha de HOY: si el día ya se cerró,
  // el reembolso quedaría moviendo la caja de un día ya cuadrado.
  if (await dataAccess.altaEnDiaCerrado([new Date().toISOString()])) {
    return { ok: false, error: "La caja de hoy ya está cerrada: el reembolso quedaría fuera del cierre." };
  }
  return reembolsarVentaTarjeta(ventaId, motivo.trim(), sesion.nombre, monto, anularVigencia === true);
}

// El comprobante de una devolución, el mismo que le llegó al cliente por
// correo, para verlo e imprimirlo desde el historial de la ficha. null si esa
// fila no es una devolución por Transbank.
export async function obtenerComprobanteReembolso(reembolsoId: string): Promise<{ html: string } | { error: string }> {
  if (!(await tieneModulo("clientes"))) return { error: "No tienes acceso a la ficha de clientes." };
  const comprobante = await cargarComprobanteReembolso(reembolsoId);
  return comprobante ? { html: htmlComprobanteReembolso(comprobante) } : { error: "Esta devolución no se hizo por Transbank: no tiene comprobante." };
}

// Reenvía ese mismo comprobante por correo, desde el visor de la ficha. Mismo
// gate que reembolsar: manda datos del cliente a la dirección que se escriba.
export async function reenviarComprobanteReembolsoPorCorreo(reembolsoId: string, email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await sesionActual();
  if (!sesion || !puedeEnviarDocumentosCliente(sesion.modulos)) {
    return { ok: false, error: "Necesitas permisos de Gerencia o de cierre de caja para reenviar el comprobante." };
  }
  const r = await reenviarComprobanteReembolso(reembolsoId, email);
  if (r.ok) console.info("Comprobante de reembolso reenviado", reembolsoId, "por", sesion.nombre);
  return r;
}
