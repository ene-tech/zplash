"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo, tieneSesionValida } from "@/lib/session";
import type { CartolaMovimiento, CategoriaGasto, CategoriaIngreso, MovimientoContable, ReglaConciliacion } from "@/types";

// Cada Venta nueva genera automáticamente su propio movimiento contable (ver
// derivarMovimientosDesdeVentas en @/context/commit/ventas), y eso pasa en
// TODO comit que incluya una venta — incluido "Registrar y dar ingreso" del
// módulo Operador, que corre con sesiones sin el módulo "contabilidad" (ver
// insertVentas en @/lib/db/ventas.ts: "cualquier sesión válida puede
// insertar ventas"). Exigir acá el módulo "contabilidad" para CUALQUIER
// movimiento —incluido este derivado— bloqueaba ese insert en silencio: el
// cliente/venta/ingreso quedaban guardados pero el commit completo se
// reportaba como fallido ("sin conexión") porque este único op fallaba. Un
// movimiento derivado (con ventaId) no es más sensible que la Venta que lo
// originó, así que sigue el mismo criterio de permisos que insertVentas; un
// movimiento manual (sin ventaId, cargado desde Contabilidad) sigue
// exigiendo el módulo.
export async function upsertMovimientosContables(rows: MovimientoContable[]): Promise<boolean> {
  const derivadoDeVenta = rows.every((r) => !!r.ventaId);
  const permitido = derivadoDeVenta ? await tieneSesionValida() : await tieneModulo("contabilidad");
  if (!permitido) return false;
  return dataAccess.upsertMovimientosContables(rows);
}

export async function deleteMovimientosContables(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("contabilidad"))) return false;
  return dataAccess.deleteMovimientosContables(ids);
}

export async function upsertCategoriasGasto(rows: CategoriaGasto[]): Promise<boolean> {
  if (!(await tieneModulo("contabilidad"))) return false;
  return dataAccess.upsertCategoriasGasto(rows);
}

export async function upsertCategoriasIngreso(rows: CategoriaIngreso[]): Promise<boolean> {
  if (!(await tieneModulo("contabilidad"))) return false;
  return dataAccess.upsertCategoriasIngreso(rows);
}

export async function upsertCartolaMovimientos(rows: CartolaMovimiento[]): Promise<boolean> {
  if (!(await tieneModulo("contabilidad"))) return false;
  return dataAccess.upsertCartolaMovimientos(rows);
}

export async function deleteCartolaMovimientos(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("contabilidad"))) return false;
  return dataAccess.deleteCartolaMovimientos(ids);
}

export async function upsertReglasConciliacion(rows: ReglaConciliacion[]): Promise<boolean> {
  if (!(await tieneModulo("contabilidad"))) return false;
  return dataAccess.upsertReglasConciliacion(rows);
}
