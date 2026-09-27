"use server";

import { eq, inArray, like, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clientes,
  cupones,
  destinosInventario,
  movimientosContables,
  movimientosInventario,
  productos,
  ventaItems,
  ventas,
} from "@/db/schema";
import * as dataAccess from "@/lib/dataAccess";
import {
  generarCodigoCupon,
  generarFolioTraspaso,
  MODULOS_EDITAN_VENTAS,
  movimientoContableDesdeVenta,
  PREFIJO_VENTA_REEMBOLSO,
  stockPorDestino,
  uid,
  uidVenta,
} from "@/lib/helpers";
import { armarDevolucionPos, armarVentaPos, type LineaDevolucion, type LineaPos } from "@/lib/logic";
import { sesionActual, tieneAlgunModulo } from "@/lib/session";
import type { Cupon, DatosFacturacion, MovimientoContable, Producto, Venta, VentaItem } from "@/types";

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

/** Destino donde queda lo que vuelve con algún detalle: existe una unidad,
 * pero no está para vender hasta que alguien la revise. Es un destino de
 * inventario común y corriente, así que Inventario → Bodegas lo lista y
 * Traspasar lo devuelve a Bodega o lo manda a otra parte, sin pantalla nueva.
 * Se crea solo la primera vez que hace falta. */
const DESTINO_REVISION = { id: "dest-revision-devoluciones", nombre: "Revisión de devoluciones" };

/** Las líneas de un ticket del POS, para poder devolverlo. Fuera del snapshot
 * global a propósito: venta_items crece con cada venta y ninguna pantalla lo
 * necesita completo. */
export async function lineasDeVenta(ventaId: string): Promise<VentaItem[]> {
  if (!(await tieneAlgunModulo(["pos", ...MODULOS_EDITAN_VENTAS]))) return [];
  const db = getDb();
  const filas = await db.select().from(ventaItems).where(eq(ventaItems.ventaId, ventaId));
  return filas.map((r) => ({
    id: r.id,
    ventaId: r.ventaId,
    productoId: r.productoId || undefined,
    sku: r.sku,
    detalle: r.detalle,
    cantidad: r.cantidad,
    precioUnitario: r.precioUnitario,
  }));
}

export interface DevolucionPosInput {
  ventaId: string;
  lineas: LineaDevolucion[];
  motivo: string;
  forma: "efectivo" | "transferencia" | "tarjeta" | "vale";
}

export type DevolucionPosResultado =
  | { ok: true; venta: Venta; movimiento: MovimientoContable; productos: Producto[]; vale?: Cupon }
  | { ok: false; error: string };

/** Meses que dura el vale a favor antes de caducar. */
const MESES_VALE = 6;

/** ÚNICO camino para devolver productos vendidos en el POS: contra-asiento,
 * líneas en negativo, stock de vuelta y asiento contable que descuenta el
 * ingreso — todo en UNA transacción. Lo que vuelve "con detalle" suma stock
 * igual (la unidad existe) pero se traspasa al destino de revisión, así no se
 * puede vender por error antes de que alguien la mire. */
export async function registrarDevolucionPos(input: DevolucionPosInput): Promise<DevolucionPosResultado> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.modulos.includes("pos")) return { ok: false, error: "Tu perfil no tiene acceso al POS" };

  const fecha = new Date().toISOString();
  if (await dataAccess.altaEnDiaCerrado([fecha])) {
    return { ok: false, error: "La caja de hoy ya está cerrada: la devolución hay que registrarla mañana" };
  }

  const db = getDb();
  const [original] = await db.select().from(ventas).where(eq(ventas.id, input.ventaId)).limit(1);
  if (!original) return { ok: false, error: "No se encontró la venta que estás devolviendo" };

  // Devoluciones anteriores de ESTA venta: sus ids son reembolso-<venta>-N y
  // sus líneas vienen en negativo, así que lo ya devuelto se suma de ahí.
  const previas = await db
    .select()
    .from(ventas)
    .where(like(ventas.id, `${PREFIJO_VENTA_REEMBOLSO}${input.ventaId}-%`));
  const itemsPrevios = previas.length
    ? await db.select().from(ventaItems).where(
        inArray(
          ventaItems.ventaId,
          previas.map((v) => v.id)
        )
      )
    : [];
  const devueltoPrevio = new Map<string, number>();
  for (const it of itemsPrevios) {
    if (!it.productoId) continue;
    devueltoPrevio.set(it.productoId, (devueltoPrevio.get(it.productoId) ?? 0) + Math.abs(it.cantidad));
  }

  const armado = armarDevolucionPos({
    venta: {
      id: original.id,
      clienteId: original.clienteId || "",
      patente: original.patente,
      nombre: original.nombre,
      tipoDocumento: (original.tipoDocumento as Venta["tipoDocumento"]) || undefined,
      razonSocial: original.razonSocial || undefined,
      rut: original.rut || undefined,
    },
    itemsVenta: await lineasDeVenta(input.ventaId),
    devueltoPrevio,
    lineas: input.lineas,
    devolucionesPrevias: previas.length,
    fecha,
    creadoPor: sesion.nombre,
    motivo: input.motivo,
    forma: input.forma,
  });
  if ("error" in armado) return { ok: false, error: armado.error };

  const ids = input.lineas.map((l) => l.productoId);
  const conDetalle = input.lineas.filter((l) => !l.nuevo);

  // "Vale a favor" no devuelve plata: entrega un código por el monto, del
  // mismo tipo que los descuentos que ya emite B2B/Tickets, para que sea
  // canjeable de verdad y quede en la ficha del cliente. Va atado a su
  // patente si la venta tenía cliente; si fue a un invitado, el código es
  // abierto (lo usa quien lo presente, que es lo que corresponde a un vale
  // de papel).
  let vale: Cupon | undefined;
  if (input.forma === "vale") {
    const caduca = new Date(fecha);
    caduca.setMonth(caduca.getMonth() + MESES_VALE);
    const codigosUsados = new Set((await db.select({ codigo: cupones.codigo }).from(cupones)).map((c) => c.codigo));
    vale = {
      id: uid(),
      codigo: generarCodigoCupon(codigosUsados),
      nombreLote: `Devolución ${fechaCorta(fecha)}`,
      valor: Math.abs(armado.venta.precio),
      numeroLote: 1,
      totalLote: 1,
      fechaCaducidad: caduca.toISOString(),
      usado: false,
      creadoEn: fecha,
      creadoPor: sesion.nombre,
      tipo: "descuento",
      esPorcentaje: false,
      patenteAsignada: original.patente || undefined,
      canal: "local",
    };
  }
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
      for (const linea of input.lineas) {
        await tx
          .update(productos)
          .set({ stock: sql`${productos.stock} + ${linea.cantidad}` })
          .where(eq(productos.id, linea.productoId));
      }
      await tx.insert(movimientosContables).values(dataAccess.movimientoToRow(armado.movimiento));
      if (vale) await tx.insert(cupones).values(dataAccess.cuponToRow(vale));

      if (conDetalle.length) {
        await tx.insert(destinosInventario).values({ ...DESTINO_REVISION, esBodega: false, activo: true }).onConflictDoNothing();
        const bodega = (await tx.select().from(destinosInventario)).find((d) => d.esBodega);
        if (bodega) {
          const movimientos = await tx.select().from(movimientosInventario);
          let folio = Number(generarFolioTraspaso(movimientos.map((m) => m.folio)));
          for (const linea of conDetalle) {
            await tx.insert(movimientosInventario).values({
              id: uid(),
              folio: String(folio++),
              productoId: linea.productoId,
              origenId: bodega.id,
              destinoId: DESTINO_REVISION.id,
              cantidad: linea.cantidad,
              fecha,
              notas: `Devolución con detalle: ${input.motivo.trim()}`,
              creadoPor: sesion.nombre,
            });
          }
        }
      }
    });
  } catch (error) {
    console.error("Error registrando devolución POS", error);
    return { ok: false, error: "No se pudo guardar la devolución. Revisa la conexión e inténtalo de nuevo." };
  }

  const actualizados = await db.select().from(productos).where(inArray(productos.id, ids));
  return {
    ok: true,
    venta: armado.venta,
    movimiento: armado.movimiento,
    productos: actualizados.map(dataAccess.productoFromRow),
    vale,
  };
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
