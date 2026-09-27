import {
  CANAL_INGRESO_PRODUCTOS,
  PREFIJO_VENTA_REEMBOLSO,
  TIPO_VENTA_REEMBOLSO,
  fmtCLP,
} from "@/lib/helpers";
import type { MovimientoContable, Venta, VentaItem } from "@/types";

/** Una línea que el cliente devuelve. `nuevo` = producto en estado de volver
 * a la góndola; si no, la unidad existe pero no está para vender y queda en
 * el destino de revisión (ver registrarDevolucionPos). */
export interface LineaDevolucion {
  productoId: string;
  cantidad: number;
  nuevo: boolean;
}

export interface DatosDevolucionPos {
  /** La venta original del POS que se está devolviendo. */
  venta: Pick<Venta, "id" | "clienteId" | "patente" | "nombre" | "tipoDocumento" | "razonSocial" | "rut">;
  /** Líneas de esa venta, como se vendieron (para precio y glosa). */
  itemsVenta: VentaItem[];
  /** Lo ya devuelto antes de esta vez, por producto. */
  devueltoPrevio: Map<string, number>;
  lineas: LineaDevolucion[];
  /** Cuántas devoluciones tiene ya esta venta: define el id del contra-asiento. */
  devolucionesPrevias: number;
  fecha: string;
  creadoPor: string;
  motivo: string;
  /** Cómo se le devuelve la plata. "vale" no mueve caja: queda un crédito. */
  forma: "efectivo" | "transferencia" | "tarjeta" | "vale";
}

export interface DevolucionArmada {
  venta: Venta;
  items: VentaItem[];
  movimiento: MovimientoContable;
}

/** Arma el contra-asiento de una devolución de productos: una Venta de tipo
 * "Reembolso" con precio NEGATIVO y fecha de HOY (no la de la venta
 * original), sus líneas en negativo, y el movimiento contable que la
 * descuenta del canal de la tienda.
 *
 * Pura (sin DB ni reloj) para poder testearla; la escritura transaccional
 * —que además devuelve el stock— vive en registrarDevolucionPos. Valida
 * contra lo vendido y lo ya devuelto: es camino de plata, no se confía en la
 * pantalla.
 *
 * El movimiento contable es un ingreso de monto negativo, no un egreso: la
 * devolución no es un gasto del negocio, es venta que se deshace. Así el EERR
 * la resta del canal "Venta de Productos" en vez de inflar los costos —y los
 * reembolsos de tarjeta, que hoy no escriben asiento, quedan como la
 * excepción a corregir aparte. */
export function armarDevolucionPos(datos: DatosDevolucionPos): DevolucionArmada | { error: string } {
  if (!datos.lineas.length) return { error: "No hay nada marcado para devolver" };
  if (!datos.motivo.trim()) return { error: "Escribe el motivo de la devolución" };

  const itemsPorProducto = new Map(datos.itemsVenta.filter((i) => i.productoId).map((i) => [i.productoId!, i]));
  const items: VentaItem[] = [];
  const ventaId = `${PREFIJO_VENTA_REEMBOLSO}${datos.venta.id}-${datos.devolucionesPrevias + 1}`;

  for (const [i, linea] of datos.lineas.entries()) {
    const original = itemsPorProducto.get(linea.productoId);
    if (!original) return { error: "Ese producto no estaba en la venta que se está devolviendo" };
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1) {
      return { error: `Cantidad inválida para ${original.sku}` };
    }
    const disponible = original.cantidad - (datos.devueltoPrevio.get(linea.productoId) ?? 0);
    if (linea.cantidad > disponible) {
      return {
        error:
          disponible > 0
            ? `De ${original.sku} solo quedan ${disponible} por devolver`
            : `${original.sku} ya se devolvió completo`,
      };
    }
    items.push({
      id: `${ventaId}-${i}`,
      ventaId,
      productoId: original.productoId,
      sku: original.sku,
      detalle: original.detalle,
      // Negativa: la línea deshace unidades vendidas.
      cantidad: -linea.cantidad,
      precioUnitario: original.precioUnitario,
    });
  }

  const total = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0); // negativo
  const unidades = items.reduce((s, it) => s + Math.abs(it.cantidad), 0);

  const venta: Venta = {
    id: ventaId,
    clienteId: datos.venta.clienteId || "",
    patente: datos.venta.patente || "",
    nombre: datos.venta.nombre,
    plan: "",
    precio: total,
    tipo: TIPO_VENTA_REEMBOLSO,
    fecha: datos.fecha,
    creadoPor: datos.creadoPor,
    // El vale a favor no saca plata de la caja: no lleva medio de pago, para
    // que el arqueo del día no espere menos efectivo del que hay.
    metodoPago: datos.forma === "vale" ? undefined : datos.forma,
    cantidadItems: unidades,
    notas: `Devolución de ${unidades} ${unidades === 1 ? "unidad" : "unidades"} · ${glosaForma(datos.forma)} · ${datos.motivo.trim()}`,
    estadoPago: "pagado",
    tipoDocumento: datos.venta.tipoDocumento,
    razonSocial: datos.venta.razonSocial,
    rut: datos.venta.rut,
  };

  const movimiento: MovimientoContable = {
    id: `mc-venta-${ventaId}`,
    tipo: "ingreso",
    fecha: datos.fecha,
    descripcion: `Devolución de productos – ${venta.nombre} (${fmtCLP(Math.abs(total))})`,
    categoria: CANAL_INGRESO_PRODUCTOS,
    contraparte: venta.nombre,
    monto: total,
    estado: "pagado",
    metodoPago: venta.metodoPago,
    creadoEn: datos.fecha,
    creadoPor: datos.creadoPor,
    ventaId,
  };

  return { venta, items, movimiento };
}

function glosaForma(forma: DatosDevolucionPos["forma"]): string {
  if (forma === "vale") return "vale a favor";
  if (forma === "tarjeta") return "anulado en el terminal";
  if (forma === "transferencia") return "devuelto por transferencia";
  return "devuelto en efectivo";
}
