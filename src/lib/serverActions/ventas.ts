"use server";

import * as dataAccess from "@/lib/dataAccess";
import { MODULOS_CREAN_VENTAS, MODULOS_EDITAN_VENTAS, puedeCerrarCaja } from "@/lib/helpers";
import { sesionActual, tieneAlgunModulo } from "@/lib/session";
import type { Venta } from "@/types";

// No hay un módulo "ventas" en la UI: registrar una venta es parte del flujo
// normal de varias vistas (Operador, Servicios Adicionales, Empresa, ficha de
// Cliente), así que el permiso es la unión de los módulos de esas pantallas
// —ver MODULOS_CREAN_VENTAS/MODULOS_EDITAN_VENTAS—. Hasta sep-2026 bastaba
// una sesión válida, cuando toda sesión era de alguien que vende; el módulo
// "pos" (caja de la tienda) rompió ese supuesto y podía insertar una venta de
// plan o un "Lavado único (Web)" que el túnel canjea sin cobrar.
// El mismo chequeo que hace insertVentas, expuesto aparte para que commit()
// pueda preguntarlo ANTES de escribir nada. Hace falta porque el orden del
// commit está fijado por las FK: clientes primero, ventas después (ver
// commitClientes en @/context/commit/clientes). Rechazar la venta recién en
// insertVentas deja al cliente con el vencimiento YA extendido un mes y sin
// venta que lo delate — el reverso exacto del caso RRWL69, que es justamente
// lo que este guard venía a evitar. Preguntando antes, la operación completa
// queda sin efecto.
export async function hayVentaPlanDuplicada(rows: Venta[]): Promise<boolean> {
  // Mismo permiso que el insert que precede: si no vas a poder insertar, no
  // tienes por qué poder sondear qué ventas de plan tiene un cliente.
  if (!(await tieneAlgunModulo(MODULOS_CREAN_VENTAS))) return false;
  return dataAccess.duplicaVentaPlanReciente(rows);
}

export async function insertVentas(rows: Venta[]): Promise<boolean> {
  if (!(await tieneAlgunModulo(MODULOS_CREAN_VENTAS))) return false;
  if (await dataAccess.altaEnDiaCerrado(rows.map((v) => v.fecha))) return false;
  // Segunda venta de plan al mismo cliente en minutos: siempre es el clic de
  // más del operador, nunca un cliente pagando dos meses (ver
  // duplicaVentaPlanReciente). usePlanActions ya lo corta en pantalla con un
  // mensaje claro; esto cubre lo que ese guard no puede ver, dos operadores en
  // máquinas distintas.
  if (await dataAccess.duplicaVentaPlanReciente(rows)) return false;
  return dataAccess.insertVentas(rows);
}

export async function upsertVentas(rows: Venta[]): Promise<boolean> {
  if (!(await tieneAlgunModulo(MODULOS_EDITAN_VENTAS))) return false;
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
