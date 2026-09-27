"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clientes,
  destinosInventario,
  movimientosContables,
  movimientosInventario,
  productos,
  ventaItems,
  ventas,
} from "@/db/schema";
import * as dataAccess from "@/lib/dataAccess";
import { generarFolioTraspaso, movimientoContableDesdeVenta, stockPorDestino, uid, uidVenta } from "@/lib/helpers";
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
/** El stock por destino no se guarda: se deriva restándole a Bodega lo
 * traspasado a las vending (ver stockPorDestino). Como la venta descuenta del
 * stock TOTAL, vender unidades que están cargadas en una máquina dejaba a
 * Bodega en negativo para siempre — una fila que desaparece de Bodegas y un
 * total que no cuadra con lo que lista. Acá se emite el traspaso que faltaba,
 * trayendo de vuelta a Bodega justo lo que quedó descubierto: es lo que pasó
 * de verdad si alguien sacó producto de la máquina para venderlo en el mesón.
 * Caso normal (producto en Bodega): no escribe nada. */
async function cuadrarBodega(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  productoIds: string[],
  creadoPor: string
): Promise<void> {
  const [destinos, movimientos, filas] = await Promise.all([
    tx.select().from(destinosInventario),
    tx.select().from(movimientosInventario),
    tx.select().from(productos).where(inArray(productos.id, productoIds)),
  ]);
  const bodega = destinos.find((d) => d.esBodega);
  if (!bodega) return;

  let folio = Number(generarFolioTraspaso(movimientos.map((m) => m.folio)));
  for (const producto of filas) {
    // stockPorDestino pide el tipo de dominio; de la base vienen null donde
    // el tipo dice undefined, y solo se leen producto/origen/destino/cantidad.
    const porDestino = stockPorDestino(
      producto,
      destinos,
      movimientos.map((m) => ({ ...m, notas: m.notas || undefined, creadoPor: m.creadoPor || undefined }))
    );
    const enBodega = porDestino.get(bodega.id) ?? 0;
    if (enBodega >= 0) continue;
    // Se trae del destino que más tenga; si no alcanza, se trae lo que haya
    // (el faltante restante es un descuadre de inventario de verdad, que se
    // arregla contando, no acá).
    const origen = [...porDestino.entries()]
      .filter(([id, cantidad]) => id !== bodega.id && cantidad > 0)
      .sort((a, b) => b[1] - a[1])[0];
    if (!origen) continue;
    const cantidad = Math.min(-enBodega, origen[1]);
    await tx.insert(movimientosInventario).values({
      id: uid(),
      folio: String(folio++),
      productoId: producto.id,
      origenId: origen[0],
      destinoId: bodega.id,
      cantidad,
      fecha: new Date().toISOString(),
      notas: "Traspaso automático: se vendió en el POS producto que estaba cargado en este destino",
      creadoPor,
    });
  }
}

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
      await cuadrarBodega(tx, ids, sesion.nombre);
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
