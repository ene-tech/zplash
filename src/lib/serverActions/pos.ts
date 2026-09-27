"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, movimientosContables, productos, ventaItems, ventas } from "@/db/schema";
import * as dataAccess from "@/lib/dataAccess";
import { movimientoContableDesdeVenta, uidVenta } from "@/lib/helpers";
import { armarVentaPos, type LineaPos } from "@/lib/logic";
import { sesionActual } from "@/lib/session";
import type { DatosFacturacion, MovimientoContable, Producto, Venta, VentaItem } from "@/types";

export interface VentaPosInput {
  lineas: LineaPos[];
  metodoPago: "efectivo" | "tarjeta" | "transferencia";
  voucher?: string;
  /** Opcional: si viene, la compra queda en la ficha de ese cliente. */
  clienteId?: string;
  nombre?: string;
  notas?: string;
  datosFactura?: DatosFacturacion;
}

export type VentaPosResultado =
  | { ok: true; venta: Venta; items: VentaItem[]; productos: Producto[]; movimiento: MovimientoContable | null }
  | { ok: false; error: string };

/** ÚNICO camino para registrar una venta de productos: inserta la venta, sus
 * líneas, el descuento de stock y el movimiento contable derivado en UNA
 * transacción — o queda todo, o no queda nada (a diferencia del commit() de
 * AppContext, cuyo rollback es solo local). El descuento es SQL puro
 * (`stock = stock - n`), inmune a lost updates entre dos cajas. El cliente
 * aplica el resultado en memoria con el resultado que devuelve. `creadoPor`
 * sale de la sesión, no del navegador. */
export async function registrarVentaPos(input: VentaPosInput): Promise<VentaPosResultado> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.modulos.includes("pos")) return { ok: false, error: "Tu perfil no tiene acceso al POS" };

  const fecha = new Date().toISOString();
  if (await dataAccess.altaEnDiaCerrado([fecha])) {
    return { ok: false, error: "La caja de hoy ya está cerrada: no se pueden registrar más ventas" };
  }

  const ids = input.lineas.map((l) => l.productoId);
  if (!ids.length) return { ok: false, error: "El carrito está vacío" };

  const db = getDb();
  const [productosRows, clienteRows] = await Promise.all([
    db.select().from(productos).where(inArray(productos.id, ids)),
    input.clienteId
      ? db.select().from(clientes).where(eq(clientes.id, input.clienteId)).limit(1)
      : Promise.resolve([]),
  ]);
  if (input.clienteId && !clienteRows.length) return { ok: false, error: "El cliente elegido ya no existe" };
  const cliente = clienteRows[0];

  const armado = armarVentaPos({
    id: uidVenta(),
    fecha,
    lineas: input.lineas,
    productos: productosRows.map((p) => ({ id: p.id, sku: p.sku, detalle: p.detalle })),
    metodoPago: input.metodoPago,
    voucher: input.voucher,
    creadoPor: sesion.nombre,
    cliente: cliente ? { id: cliente.id, nombre: cliente.nombre, patente: cliente.patente } : undefined,
    nombre: input.nombre,
    notas: input.notas,
    datosFactura: input.datosFactura,
  });
  if ("error" in armado) return { ok: false, error: armado.error };

  const movimiento = movimientoContableDesdeVenta(armado.venta);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(ventas).values(dataAccess.ventaToRow(armado.venta));
      await tx.insert(ventaItems).values(
        armado.items.map((it) => ({
          id: it.id,
          ventaId: it.ventaId,
          productoId: it.productoId || null,
          sku: it.sku,
          detalle: it.detalle,
          cantidad: it.cantidad,
          precioUnitario: it.precioUnitario,
        }))
      );
      // Stock negativo permitido a propósito: no se bloquea una venta en el
      // mesón por un inventario desactualizado — un stock bajo cero es señal
      // de ajuste en Inventario, no motivo para no cobrar.
      for (const linea of input.lineas) {
        await tx
          .update(productos)
          .set({ stock: sql`${productos.stock} - ${linea.cantidad}` })
          .where(eq(productos.id, linea.productoId));
      }
      if (movimiento) await tx.insert(movimientosContables).values(dataAccess.movimientoToRow(movimiento));
    });
  } catch (error) {
    console.error("Error registrando venta POS", error);
    return { ok: false, error: "No se pudo guardar la venta. Revisa la conexión e inténtalo de nuevo." };
  }

  const actualizados = await db.select().from(productos).where(inArray(productos.id, ids));
  return {
    ok: true,
    venta: armado.venta,
    items: armado.items,
    productos: actualizados.map(dataAccess.productoFromRow),
    movimiento,
  };
}
