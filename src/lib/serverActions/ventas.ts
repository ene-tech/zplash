"use server";

import * as dataAccess from "@/lib/dataAccess";
import { puedeCerrarCaja } from "@/lib/helpers";
import { sesionActual, tieneSesionValida } from "@/lib/session";
import type { Venta } from "@/types";

// No hay un módulo "ventas" en la UI (registrar una venta es parte del flujo
// normal de varias vistas: Servicios Adicionales, Empresa, Clientes), así que
// a diferencia de clientes/empresas_facturacion/contabilidad acá no hay un
// tieneModulo específico que cerrar: cualquier sesión válida puede insertar o
// actualizar ventas. Intencional, no un descuido.
export async function insertVentas(rows: Venta[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  if (await dataAccess.altaEnDiaCerrado(rows.map((v) => v.fecha))) return false;
  return dataAccess.insertVentas(rows);
}

export async function upsertVentas(rows: Venta[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  // Una venta que registró sola la plataforma no se reclasifica ni le cambia
  // el medio de pago: no hubo persona que se pudiera equivocar (ver
  // reclasificaVentaAutomatica).
  if (await dataAccess.reclasificaVentaAutomatica(rows)) return false;
  // Un día ya cerrado no se toca más, salvo los campos que no mueven plata
  // (factura emitida, canje de un lavado web prepagado) — ver
  // edicionVentasEnDiaCerrado/soloCambiosSinPlata.
  if (await dataAccess.edicionVentasEnDiaCerrado(rows)) return false;
  return dataAccess.upsertVentas(rows);
}

// Gateada con "permisos" (Gerencia) o "arqueo", a diferencia de insertVentas/
// upsertVentas: borrar un servicio ya registrado (y el pago Transbank que
// haya generado, si tuvo uno) es destructivo e irreversible, no una
// operación que cualquier operador con acceso a Servicios Adicionales deba
// poder hacer. "arqueo" entra porque es quien responde por la caja del día;
// el arqueo en sí ya no borra ventas —lo que no cuadra se corrige con el
// asiento de ajuste de ingreso monetario, ver ArqueoDia— pero una venta de un
// día YA cerrado igual queda fuera de alcance, más abajo.
export async function deleteVentas(ids: string[]): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion || !(sesion.modulos.includes("permisos") || puedeCerrarCaja(sesion.modulos))) return false;
  if (await dataAccess.bajaEnDiaCerrado("ventas", ids)) return false;
  return dataAccess.deleteVentas(ids);
}
