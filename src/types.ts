export interface Cliente {
  id: string;
  nombre: string;
  patente: string;
  telefono?: string;
  email?: string;
  vehiculo?: string;
  plan?: string;
  tipoDocumento?: "Boleta" | "Factura";
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

// Empresas de compra y venta para emitir/recibir facturas. contactoClienteId
// referencia (informativamente, sin FK estricta, mismo criterio que
// ingresos/ventas.clienteId) a un cliente de la tabla clientes; contactoNombre
// queda denormalizado para no perder el dato si ese cliente se elimina.
export interface Empresa {
  id: string;
  razonSocial: string;
  rut: string;
  giro?: string;
  direccion?: string;
  telefono?: string;
  contactoClienteId?: string;
  contactoNombre?: string;
  creadoEn: string;
  creadoPor?: string;
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

// Un módulo = una vista principal de la app. Determina qué ve cada perfil
// una vez que inició sesión (ver PerfilPublico.modulos).
export type Modulo =
  | "operador"
  | "servicios"
  | "clientes"
  | "ingresos"
  | "cierre"
  | "empresa"
  | "empresas_facturacion"
  | "perfiles"
  | "stats"
  | "config"
  | "contabilidad"
  | "permisos";

// Lo que el cliente sí puede cargar: nombre y módulos permitidos, nunca la
// contraseña. La clave solo se consulta/valida server-side, dentro de las
// rutas /api/perfiles/*.
export interface PerfilPublico {
  id: string;
  nombre: string;
  modulos: Modulo[];
}

export interface MovimientoContable {
  id: string;
  // "cuenta_por_pagar" existió como tipo creable hasta que esa pestaña pasó
  // a derivarse de egresos con estado x_rendir/pendiente_pago (ver
  // CuentasPorPagarTab). No quedan filas con ese tipo, así que se retiró.
  tipo: "ingreso" | "egreso" | "cuenta_por_cobrar";
  fecha: string;
  descripcion: string;
  categoria?: string;
  contraparte?: string;
  rutProveedor?: string;
  numeroFactura?: string;
  tipoDocumento?: "Boleta" | "Factura";
  documentoUrl?: string;
  documentoNombre?: string;
  monto: number;
  estado: "pagado" | "pendiente" | "pagado_cc" | "x_rendir" | "pendiente_pago";
  notas?: string;
  creadoEn: string;
  creadoPor?: string;
}

// Glosa seleccionable para el formulario de Egresos/Gastos. "grupo" debe ser
// uno de los 5 grupos fijos del EERR (ver GRUPOS_GASTO_EERR en helpers.ts);
// "activa" permite retirarla del selector de nuevos gastos sin borrarla
// (borrarla de verdad dejaría huérfanos los movimientos históricos que ya
// la usan).
export interface CategoriaGasto {
  id: string;
  nombre: string;
  grupo: string;
  activa: boolean;
}

export type Precios = Record<string, { normal: number; promo: number }>;

export interface AppData {
  clientes: Cliente[];
  ingresos: Ingreso[];
  ventas: Venta[];
  pinAdmin: string;
  precios: Precios;
  perfiles: PerfilPublico[];
  cupones: Cupon[];
  movimientosContables: MovimientoContable[];
  categoriasGasto: CategoriaGasto[];
  empresas: Empresa[];
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
  | { type: "perfil"; data: PerfilPublico | null }
  | { type: "bulk" }
  | { type: "pago"; monto: number; descripcion: string; onConfirm: (pago: PagoInfo) => void }
  | { type: "clienteInfo"; data: Cliente }
  | { type: "empresa"; data: Empresa | null }
  | null;

export interface UIState {
  view: "login" | "hub" | "operador" | "admin" | "servicios" | "contabilidad";
  operResult: OperResult;
  adminTab: string;
  contabilidadTab: string;
  search: string;
  modal: ModalState;
  loginErr: string;
  cierreDesde: string | null;
  cierreHasta: string | null;
  facturaSearch: string;
  loginMode: "select" | "pin" | null;
  perfilSeleccionadoId: string | null;
  perfilActual: PerfilPublico | null;
  clientesFiltroEstado: string;
  clientesOrden: string;
}
