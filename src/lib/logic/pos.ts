import { TIPO_VENTA_PRODUCTOS } from "@/lib/helpers";
import type { DatosFacturacion, Venta, VentaItem } from "@/types";

export interface LineaPos {
  productoId: string;
  cantidad: number;
  precioUnitario: number;
}

export interface DatosVentaPos {
  id: string;
  fecha: string;
  lineas: LineaPos[];
  productos: { id: string; sku: string; detalle: string }[];
  metodoPago: "efectivo" | "tarjeta" | "transferencia";
  voucher?: string;
  creadoPor: string;
  /** Cliente del lavado, opcional: la venta de mesón no lo pide, pero si se
   * elige, la compra queda en su ficha (misma patente que sus lavados). */
  cliente?: { id: string; nombre: string; patente: string };
  /** Glosa del ticket cuando no hay cliente; por defecto "Invitado". */
  nombre?: string;
  notas?: string;
  datosFactura?: DatosFacturacion;
}

/** Arma la Venta y sus líneas a partir del carrito. Pura (sin DB ni reloj)
 * para poder testearla; la escritura transaccional vive en
 * registrarVentaPos (@/lib/serverActions/pos). Devuelve un error legible si
 * el carrito no es válido — es camino de plata, no se confía en la UI. */
export function armarVentaPos(datos: DatosVentaPos): { venta: Venta; items: VentaItem[] } | { error: string } {
  if (!datos.lineas.length) return { error: "El carrito está vacío" };
  const productosPorId = new Map(datos.productos.map((p) => [p.id, p]));
  const items: VentaItem[] = [];
  for (const [i, linea] of datos.lineas.entries()) {
    const producto = productosPorId.get(linea.productoId);
    if (!producto) return { error: "Hay un producto del carrito que ya no existe" };
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1) {
      return { error: `Cantidad inválida para ${producto.sku}` };
    }
    if (!Number.isFinite(linea.precioUnitario) || linea.precioUnitario < 0) {
      return { error: `Precio inválido para ${producto.sku}` };
    }
    items.push({
      id: `${datos.id}-${i}`,
      ventaId: datos.id,
      productoId: producto.id,
      sku: producto.sku,
      detalle: producto.detalle,
      cantidad: linea.cantidad,
      precioUnitario: linea.precioUnitario,
    });
  }

  const venta: Venta = {
    id: datos.id,
    // "" = venta a invitado (ventaToRow lo normaliza a NULL, igual que en
    // los lavados sin registro). Es la marca que separa lo que puede sumar a
    // un programa de puntos de lo que no: sin clienteId no hay a quién
    // acreditarle nada.
    clienteId: datos.cliente?.id || "",
    patente: datos.cliente?.patente || "",
    nombre: datos.cliente?.nombre || datos.nombre?.trim() || "Invitado",
    plan: "",
    precio: items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0),
    tipo: TIPO_VENTA_PRODUCTOS,
    fecha: datos.fecha,
    creadoPor: datos.creadoPor,
    metodoPago: datos.metodoPago,
    voucher: datos.voucher?.trim() || undefined,
    cantidadItems: items.reduce((s, it) => s + it.cantidad, 0),
    notas: datos.notas?.trim() || undefined,
    estadoPago: "pagado",
    // Campo por campo y NO `...datos.datosFactura`: eso viene del navegador y
    // el tipo no existe en runtime, así que un POST directo al Server Action
    // podía mandar {precio, fecha, creadoPor, ...} y pisar lo que el servidor
    // acababa de calcular — precio negativo, venta metida en un día ya
    // cerrado, o a nombre de otro funcionario.
    tipoDocumento: datos.datosFactura?.tipoDocumento,
    razonSocial: datos.datosFactura?.razonSocial,
    rut: datos.datosFactura?.rut,
    direccion: datos.datosFactura?.direccion,
    giro: datos.datosFactura?.giro,
  };
  return { venta, items };
}
