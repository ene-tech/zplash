import type { ResumenCierre } from "@/types";
import { fmtFecha } from "./fechas";
import { fmtCLP } from "./precios";

/** Campos que igual se pueden escribir en una fila de un día ya cerrado:
 * ninguno mueve un peso ni cambia un total del cierre.
 *  - facturaEmitida: marcar la factura como emitida es trabajo posterior al
 *    cierre (ver "Facturas pendientes de emitir" en CierreTab).
 *  - canjeadaEn: un "Lavado único (Web)" pagado por adelantado se canjea el
 *    día que el auto llega al túnel, no el día en que se pagó.
 *  - creadoEn: metadato del movimiento contable derivado de una venta, que
 *    movimientoContableDesdeVenta rearma con la hora actual en cada commit —
 *    sin esta excepción, editar cualquiera de los dos campos de arriba
 *    arrastraría un upsert "cambiado" del movimiento y el commit completo
 *    fallaría. */
const CAMPOS_SIN_PLATA = new Set(["facturaEmitida", "canjeadaEn", "creadoEn"]);

/** true si `nuevo` no cambia nada de `previo` salvo campos sin plata (ver
 * CAMPOS_SIN_PLATA). Sin `previo` (fila nueva) siempre es false: en un día
 * cerrado no se dan de alta filas. Compara valor a valor porque todos los
 * campos de Venta/MovimientoContable son primitivos. */
export function soloCambiosSinPlata(
  previo: Record<string, unknown> | undefined,
  nuevo: Record<string, unknown>
): boolean {
  if (!previo) return false;
  for (const clave of new Set([...Object.keys(previo), ...Object.keys(nuevo)])) {
    if (CAMPOS_SIN_PLATA.has(clave)) continue;
    if (previo[clave] !== nuevo[clave]) return false;
  }
  return true;
}

/** "+2" / "-1": el signo va explícito porque un ajuste de conteo se lee al
 * revés según para dónde vaya (vehículos que faltaban vs. registrados de más). */
export function signo(cantidad: number): string {
  return cantidad > 0 ? `+${cantidad}` : String(cantidad);
}

/** Resumen que se le muestra a quien cierra, antes de preguntarle si está
 * todo ok (ver ArqueoDia). Texto plano a propósito: lo consume el
 * ConfirmModal, que ya existe y renderiza un string. */
export function resumenCierreTexto(fecha: string, resumen: ResumenCierre, esHoy: boolean): string {
  const diferencia =
    resumen.efectivoContado === undefined ? null : resumen.efectivoContado - resumen.efectivoEsperado;
  return [
    `Cierre de caja del ${fmtFecha(fecha + "T00:00:00")}`,
    "",
    `Vehículos ingresados: ${resumen.cantidadIngresos}`,
    ...(resumen.ajusteIngresos
      ? [
          `Asiento de ajuste de ingreso a túnel: ${signo(resumen.ajusteIngresos.cantidad)} — ${resumen.ajusteIngresos.motivo}`,
          `Total real de vehículos: ${resumen.cantidadIngresos + resumen.ajusteIngresos.cantidad}`,
        ]
      : []),
    `Ventas: ${resumen.cantidadVentas} por ${fmtCLP(resumen.totalVentas)}`,
    "",
    ...resumen.metodosPago.filter((m) => m.cantidad || m.monto).map((m) => `${m.metodo}: ${m.cantidad} · ${fmtCLP(m.monto)}`),
    "",
    `Efectivo esperado en caja: ${fmtCLP(resumen.efectivoEsperado)}`,
    ...(diferencia === null
      ? ["Efectivo contado: no se contó"]
      : [
          `Efectivo contado: ${fmtCLP(resumen.efectivoContado!)}`,
          diferencia === 0
            ? "La caja cuadra exacta."
            : diferencia > 0
              ? `Sobran ${fmtCLP(diferencia)} respecto de lo esperado.`
              : `Faltan ${fmtCLP(-diferencia)} respecto de lo esperado.`,
        ]),
    "",
    ...(esHoy ? ["Estás cerrando HOY: después de esto no se podrán registrar más ingresos ni ventas con fecha de hoy.", ""] : []),
    "¿Está todo correcto? Una vez cerrado, ninguna venta, ingreso o movimiento de ese día se podrá modificar. No se puede deshacer.",
  ].join("\n");
}
