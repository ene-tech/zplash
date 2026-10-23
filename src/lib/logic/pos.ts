import { fmtCLP, montoDescuento, resolverDescuento, TIPO_VENTA_PRODUCTOS } from "@/lib/helpers";
import type { Cliente, Cupon, DatosFacturacion, Venta, VentaItem } from "@/types";

const METODOS_POS = ["efectivo", "tarjeta", "transferencia"] as const;

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
  /** Sin definir solo si el descuento cubre el total (venta en $0). */
  metodoPago?: "efectivo" | "tarjeta" | "transferencia";
  voucher?: string;
  creadoPor: string;
  /** Código de descuento YA validado en el servidor (resolverDescuentoPos). */
  descuento?: Pick<Cupon, "codigo" | "valor" | "esPorcentaje">;
  /** Cliente del lavado, opcional: la venta de mesón no lo pide, pero si se
   * elige, la compra queda en su ficha (misma patente que sus lavados). */
  cliente?: { id: string; nombre: string; patente: string };
  /** Glosa del ticket cuando no hay cliente; por defecto "Invitado". */
  nombre?: string;
  notas?: string;
  datosFactura?: DatosFacturacion;
}

/** Cuánto rebaja un código de descuento sobre el subtotal del carrito: nunca
 * negativo ni más que el subtotal. La usan armarVentaPos (lo que se graba) y
 * el POS (lo que se pinta mientras se arma el carrito), para que no diverjan. */
export function rebajaDescuento(
  descuento: Pick<Cupon, "valor" | "esPorcentaje"> | null | undefined,
  bruto: number
): number {
  return descuento ? Math.min(bruto, Math.max(0, montoDescuento(descuento, bruto))) : 0;
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

  const bruto = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0);
  // Nunca total negativo: un vale de $10.000 contra $6.000 de productos deja
  // la venta en $0 y el saldo se pierde (mismo criterio que precioConCupon en
  // el mesón; un vale es de un solo uso).
  const rebaja = rebajaDescuento(datos.descuento, bruto);
  const precio = bruto - rebaja;
  // El método llega del navegador: se valida contra la lista (y no solo por
  // el tipo, que en runtime no existe). Con $0 no hay nada que cobrar.
  if (precio > 0 && !METODOS_POS.includes(datos.metodoPago as (typeof METODOS_POS)[number])) {
    return { error: "Elige la forma de pago" };
  }
  const glosaDescuento = datos.descuento ? `Descuento ${datos.descuento.codigo} (−${fmtCLP(rebaja)})` : "";
  const notas = [datos.notas?.trim(), glosaDescuento].filter(Boolean).join(" · ");

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
    // Las líneas quedan a precio de lista y la venta al precio cobrado: la
    // diferencia es el descuento (ver glosa en notas y cuponCodigo), y la
    // devolución la prorratea (ver armarDevolucionPos).
    precio,
    tipo: TIPO_VENTA_PRODUCTOS,
    fecha: datos.fecha,
    creadoPor: datos.creadoPor,
    metodoPago: precio > 0 ? datos.metodoPago : undefined,
    voucher: precio > 0 ? datos.voucher?.trim() || undefined : undefined,
    cantidadItems: items.reduce((s, it) => s + it.cantidad, 0),
    notas: notas || undefined,
    viaCupon: datos.descuento ? true : undefined,
    cuponCodigo: datos.descuento?.codigo,
    estadoPago: "pagado",
    // Campo por campo y NO `...datos.datosFactura`: eso viene del navegador y
    // el tipo no existe en runtime, así que un POST directo al Server Action
    // podía mandar {precio, fecha, creadoPor, ...} y pisar lo que el servidor
    // acababa de calcular — precio negativo, venta metida en un día ya
    // cerrado, o a nombre de otro funcionario.
    // Boleta explícita: sin ella una venta a un cliente con Factura en su
    // ficha se facturaría igual (ver sigueDocumentoDeFicha).
    tipoDocumento: datos.datosFactura?.tipoDocumento ?? "Boleta",
    razonSocial: datos.datosFactura?.razonSocial,
    rut: datos.datosFactura?.rut,
    direccion: datos.datosFactura?.direccion,
    giro: datos.datosFactura?.giro,
  };
  return { venta, items };
}

/** Lote de los vales a favor que emite una devolución de la tienda
 * (registrarDevolucionPos): `Devolución <fecha>`. */
export const PREFIJO_VALE_TIENDA = "Devolución ";

/** Valida un código de descuento tipeado en el POS de la tienda. Solo pasan
 * los vales a favor de una devolución de la tienda: los cupones del lavado
 * (campañas, referidos, bienvenida) valen para una pasada por el túnel y se
 * usan en el mesón (decisión del 23-oct-2026). Así una campaña con códigos
 * abiertos no se gasta en productos ni ensucia su medición, y un código de
 * amigo quemado en la tienda no le dispara el premio al que lo compartió.
 * Para el vale valen las mismas reglas que en el mesón (resolverDescuento:
 * usado, vigencia, canal local y patente asignada). */
export function resolverDescuentoPos(
  codigoCrudo: string,
  patente: string,
  cupones: Cupon[],
  clientes: Cliente[]
): { ok: true; cupon: Cupon } | { ok: false; msg: string } {
  const codigo = codigoCrudo.trim().toUpperCase();
  const cupon = cupones.find((c) => c.codigo === codigo);
  if (cupon && !cupon.nombreLote.startsWith(PREFIJO_VALE_TIENDA)) {
    return { ok: false, msg: "Este código es para el lavado del túnel y se usa en el mesón, no en la tienda" };
  }
  return resolverDescuento(codigo, patente, cupones, clientes);
}
