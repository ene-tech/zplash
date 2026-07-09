export interface Cliente {
  id: string;
  nombre: string;
  patente: string;
  telefono?: string;
  email?: string;
  vehiculo?: string;
  plan?: string;
  tipoDocumento?: "Boleta" | "Factura" | string;
  razonSocial?: string;
  rut?: string;
  direccion?: string;
  giro?: string;
  vencimiento?: string | null;
  fechaContratacion?: string | null;
  origen?: "WEB" | "LOCAL";
  visitas?: number;
  ultimaVisita?: string;
  ultimaRenovacion?: string;
  creadoEn: string;
  creadoPor?: string;
}

export interface Ingreso {
  id: string;
  clienteId: string;
  patente: string;
  nombre: string;
  fecha: string;
  planEstadoAlIngreso: "ok" | "warn" | "bad";
  operador?: string;
  esGarantia?: boolean;
  viaCupon?: boolean;
  cuponCodigo?: string;
}

export interface Venta {
  id: string;
  clienteId: string;
  patente: string;
  nombre: string;
  plan: string;
  precio: number;
  tipo: string;
  fecha: string;
  operador?: string;
  metodoPago?: "efectivo" | "tarjeta" | "transferencia";
  voucher?: string;
  horaEntrega?: string;
  notas?: string;
  estadoPago?: "pagado" | "abono50" | "pendiente";
  montoCobrado?: number;
  esServicioAdicional?: boolean;
  tipoDocumento?: "Boleta" | "Factura";
  razonSocial?: string;
  rut?: string;
  direccion?: string;
  giro?: string;
}

export interface PagoInfo {
  metodo: "efectivo" | "tarjeta";
  voucher?: string;
}

export interface Cupon {
  id: string;
  codigo: string;
  nombreLote: string;
  valor: number;
  numeroLote: number;
  totalLote: number;
  fechaCaducidad: string;
  usado: boolean;
  patenteUso?: string;
  fechaUso?: string;
  operadorUso?: string;
  creadoEn: string;
  creadoPor?: string;
}

export interface Operador {
  id: string;
  nombre: string;
  clave: string;
}

export type Precios = Record<string, { normal: number; promo: number }>;

export interface AppData {
  clientes: Cliente[];
  ingresos: Ingreso[];
  ventas: Venta[];
  pinAdmin: string;
  precios: Precios;
  operadores: Operador[];
  cupones: Cupon[];
}

export type PlanStatusCls = "ok" | "warn" | "bad";

export interface PlanStatus {
  label: string;
  cls: PlanStatusCls;
  diasRestantes?: number;
}

export type OperResult =
  | { found: true; cliente: Cliente }
  | { found: false; plate: string }
  | null;

export type ModalState =
  | { type: "client"; data: Cliente | null; contexto?: "operador" | "admin" }
  | { type: "confirm"; mensaje: string; onConfirm: () => void; confirmLabel?: string; danger?: boolean }
  | { type: "operador"; data: Operador | null }
  | { type: "bulk" }
  | { type: "pago"; monto: number; descripcion: string; onConfirm: (pago: PagoInfo) => void }
  | { type: "clienteInfo"; data: Cliente }
  | null;

export interface UIState {
  view: "login" | "operador" | "admin" | "servicios";
  operResult: OperResult;
  adminTab: string;
  search: string;
  modal: ModalState;
  loginErr: string;
  cierreDesde: string | null;
  cierreHasta: string | null;
  facturaSearch: string;
  loginMode: "pin" | "operadorSelect" | "operadorPin" | "servSelect" | "servPin" | null;
  operadorSeleccionado: string | null;
  operadorActual: string | null;
  clientesFiltroEstado: string;
  clientesOrden: string;
}
