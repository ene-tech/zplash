"use server";

import * as dataAccess from "@/lib/dataAccess";
import { esAjusteCierre } from "@/lib/helpers";
import { tieneModulo, tieneSesionValida } from "@/lib/session";
import type { CartolaMovimiento, CategoriaGasto, CategoriaIngreso, MovimientoContable, ReglaConciliacion } from "@/types";

// Cada Venta nueva genera automáticamente su propio movimiento contable (ver
// derivarMovimientosDesdeVentas en @/context/commit/ventas), y eso pasa en
// TODO comit que incluya una venta — incluido "Registrar y dar ingreso" del
// módulo Operador, que corre con sesiones sin el módulo "contabilidad" (ver
// insertVentas en @/lib/serverActions/ventas.ts: "cualquier sesión válida puede
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
  // El asiento con que se cuadra la caja al cerrar el día lo inscribe quien
  // hace el arqueo (ver ArqueoDia): tiene el módulo "arqueo", pero no
  // necesariamente "contabilidad". El permiso alcanza solo a esa fila — su id
  // lo fija idAjusteCierre, así que no sirve para colar ningún otro movimiento.
  const ajusteDeCierre = rows.length > 0 && rows.every((r) => esAjusteCierre(r.id) && !r.ventaId);
  const permitido = derivadoDeVenta
    ? await tieneSesionValida()
    : (await tieneModulo("contabilidad")) || (ajusteDeCierre && (await tieneModulo("arqueo")));
  if (!permitido) return false;
  // Mismo criterio que upsertVentas: en un día ya cerrado solo pasa el upsert
  // que no cambia ningún monto/estado/método (ver soloCambiosSinPlata) — es
  // el caso del movimiento derivado que se rearma en cada commit de su venta.
  if (await dataAccess.edicionMovimientosEnDiaCerrado(rows)) return false;
  return dataAccess.upsertMovimientosContables(rows);
}

// Mismo criterio de permisos que upsertMovimientosContables, por el mismo
// motivo: al borrar una Venta, commit() arrastra el borrado de su movimiento
// derivado (ver derivarMovimientosDesdeVentas) y eso corre con la sesión de
// quien borró la venta — un operador de Servicios Adicionales o quien cuadra
// la caja del día, ninguno de los dos con el módulo "contabilidad". Exigirlo
// para esos derivados hacía fallar el commit completo y dejaba la venta sin
// borrar. Un movimiento manual (sin ventaId) sigue exigiendo el módulo.
export async function deleteMovimientosContables(ids: string[]): Promise<boolean> {
  const derivadosDeVenta = await dataAccess.sonMovimientosDerivadosDeVenta(ids);
  const permitido = derivadosDeVenta ? await tieneSesionValida() : await tieneModulo("contabilidad");
  if (!permitido) return false;
  if (await dataAccess.bajaEnDiaCerrado("movimientos", ids)) return false;
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
