import type { DatosFacturacion } from "./clientes";

export interface PagoInfo {
  metodo: "efectivo" | "tarjeta" | "transferencia";
  voucher?: string;
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
  metodoPago?: "efectivo" | "tarjeta" | "transferencia";
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
  // Email de quien compró (hoy solo se llena en Pack Empresa por web) —
  // permite mostrarle esta venta en Mi Cuenta buscando por el correo de la
  // sesión, sin depender de clienteId (que queda null en compras B2B).
  email?: string;
}
