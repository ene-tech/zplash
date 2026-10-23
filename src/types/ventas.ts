import type { DatosFacturacion } from "./clientes";

export interface PagoInfo {
  // Sin definir cuando el monto a cobrar es $0 (venta cubierta 100% por un
  // cupón/descuento): ahí no corresponde pedir método de pago porque el
  // cliente no está pagando nada (ver pedirPago en useIngresoActions/
  // usePlanActions/useOperadorNotFoundResult).
  metodo?: "efectivo" | "tarjeta" | "transferencia";
  voucher?: string;
  // Boleta o factura elegida al cobrar (solo cuando el modal recibe el
  // cliente). Se copia tal cual en la Venta. Factura sin RUT = con los datos
  // de la ficha del cliente (ver receptorDe en @/lib/facturacion).
  documento?: DatosFacturacion;
  // true si el cobro lo aprobó el terminal integrado (ver posIntegrado): si
  // después la venta no se guarda, la plata YA se cobró y hay que decirlo.
  viaTerminal?: boolean;
  // Nº de operación del terminal (si lo informó): con él se anula el cobro
  // cuando la venta no se puede guardar (ver anularPosIntegrado).
  operacionTerminal?: string;
}

/** Una línea de un ticket del POS de productos (tabla venta_items).
 * sku/detalle son snapshot al momento de la venta: si el producto se
 * renombra o se borra después, la boleta histórica no cambia. */
export interface VentaItem {
  id: string;
  ventaId: string;
  /** undefined si el producto se borró después (FK set null). */
  productoId?: string;
  sku: string;
  detalle: string;
  cantidad: number;
  precioUnitario: number;
}

export interface Venta extends DatosFacturacion {
  id: string;
  clienteId: string;
  patente: string;
  nombre: string;
  plan: string;
  precio: number;
  tipo: string;
  fecha: string;
  creadoPor?: string;
  // "orden_compra": venta a empresa contra una orden de compra, que se cobra
  // después — nace con estadoPago "pendiente" (ver esCuentaPorCobrar).
  metodoPago?: "efectivo" | "tarjeta" | "transferencia" | "orden_compra";
  // N° de la orden de compra (campo "Referencia" de Venta Empresa): sale en
  // la factura a continuación del producto, para saber de qué OC nace.
  ordenCompra?: string;
  voucher?: string;
  horaEntrega?: string;
  fechaEntrega?: string;
  // Liga esta venta a la Cita creada en el mismo registro (ver registrar()
  // en ServiciosAdicionalesView), para poder mostrar y editar su Status en
  // el log "Servicios registrados" sin tener que adivinar la cita por
  // patente/fecha.
  citaId?: string;
  // Cuántos servicios del catálogo/personalizados se combinaron en este
  // registro (ver registrar() en ServiciosAdicionalesView: un vehículo con
  // varios servicios elegidos genera UNA sola Venta con el precio total,
  // no una fila por servicio). Usado para no perder la métrica "cantidad de
  // servicios vendidos" en Cierre de Caja cuando ahora "cantidad de filas"
  // ya no equivale a eso.
  cantidadItems?: number;
  notas?: string;
  // "Cuánto se pagó en el momento de la venta" — vocabulario propio de POS,
  // distinto a propósito de MovimientoContable.estado (ver más abajo): no
  // son el mismo concepto aunque ambos se llamen "estado de pago".
  estadoPago?: "pagado" | "abono50" | "pendiente";
  montoCobrado?: number;
  esServicioAdicional?: boolean;
  viaCupon?: boolean;
  cuponCodigo?: string;
  facturaEmitida?: boolean;
  // Folio SII si la emitió SimpleFactura (ver marcarFacturaEmitida).
  facturaFolio?: number;
  // Email de quien compró (hoy solo se llena en Pack Empresa por web) —
  // permite mostrarle esta venta en Mi Cuenta buscando por el correo de la
  // sesión, sin depender de clienteId (que queda null en compras B2B).
  email?: string;
  // Ver canjeadaEn en db/schema/ventas.ts — momento en que un "Lavado único
  // (Web)" pagado por adelantado se canjeó físicamente en el túnel.
  canjeadaEn?: string;
  // Operador del mesón cuyo QR originó esta venta Oneclick (ver
  // ventas.operadorQr). Solo lectura desde la app: lo escribe el servidor.
  operadorQr?: string;
}
