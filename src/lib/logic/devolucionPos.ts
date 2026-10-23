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
  venta: Pick<Venta, "id" | "clienteId" | "patente" | "nombre" | "tipoDocumento" | "razonSocial" | "rut"> & {
    /** Lo que se cobró de verdad. Si es menos que la suma de las líneas, la
     * venta llevó un código de descuento y la devolución se prorratea: si no,
     * comprar con un vale y devolver por efectivo sacaba plata de la caja. */
    precio?: number;
  };
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
  /** null si la devolución es sin monto (venta pagada entera con descuento). */
  movimiento: MovimientoContable | null;
}

/** Lo que se devuelve por las líneas marcadas (`totalLista`, en negativo o
 * positivo, a precio de lista). Si la venta llevó un código de descuento
 * (`cobrado` < `brutoVenta`), se devuelve la proporción de lo cobrado y no el
 * precio de lista: si no, comprar con un vale y devolver por efectivo sacaba
 * plata de la caja. La usan armarDevolucionPos y el modal de devolución. */
export function totalDevolucionProrrateado(totalLista: number, brutoVenta: number, cobrado: number | undefined): number {
  const total =
    cobrado !== undefined && brutoVenta > 0 && cobrado < brutoVenta
      ? Math.round((totalLista * Math.max(0, cobrado)) / brutoVenta)
      : totalLista;
  // Math.round de un negativo chico da -0: se normaliza para que "sin monto"
  // se compare y se grabe como 0.
  return total === 0 ? 0 : total;
}

/** Arma el contra-asiento de una devolución de productos: una Venta de tipo
 * "Reembolso" con precio NEGATIVO y fecha de HOY (no la de la venta
 * original), sus líneas en negativo, y el movimiento contable que la
 * descuenta del canal de la tienda (salvo el vale a favor, ver abajo).
 *
 * Pura (sin DB ni reloj) para poder testearla; la escritura transaccional
 * —que además devuelve el stock— vive en registrarDevolucionPos. Valida
 * contra lo vendido y lo ya devuelto: es camino de plata, no se confía en la
 * pantalla.
 *
 * El movimiento contable es un ingreso de monto negativo, no un egreso: la
 * devolución no es un gasto del negocio, es venta que se deshace. Así el EERR
 * la resta del canal "Venta de Productos" en vez de inflar los costos (mismo
 * criterio que el reembolso a tarjeta, ver movimientoContableDeReembolso). */
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

  const totalLista = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0); // negativo
  const brutoVenta = datos.itemsVenta.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0);
  const total = totalDevolucionProrrateado(totalLista, brutoVenta, datos.venta.precio);
  // Venta pagada entera con un código (vale, cupón): lo que vuelve es solo
  // stock. No hay plata que devolver ni vale que emitir, así que la
  // devolución queda registrada sin monto, sin medio de pago y sin asiento.
  const sinMonto = total === 0;
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
    metodoPago: datos.forma === "vale" || sinMonto ? undefined : datos.forma,
    cantidadItems: unidades,
    notas: `Devolución de ${unidades} ${unidades === 1 ? "unidad" : "unidades"} · ${sinMonto ? "sin monto (se pagó con descuento)" : glosaForma(datos.forma)} · ${datos.motivo.trim()}`,
    estadoPago: "pagado",
    tipoDocumento: datos.venta.tipoDocumento,
    razonSocial: datos.venta.razonSocial,
    rut: datos.venta.rut,
  };

  // El vale a favor tampoco lleva asiento: la plata se queda en el negocio y
  // la venta se completa cuando el vale se canjea. Esa compra se graba neta
  // del vale (armarVentaPos), así que restar aquí descontaba la venta dos
  // veces del EERR: vender 10.000, devolver con vale y comprar con él daba 0.
  if (sinMonto || datos.forma === "vale") return { venta, items, movimiento: null };

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
