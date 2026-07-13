// Snapshot opcional de datos de facturación. Lo comparten Cliente y Venta a
// propósito (mismos 5 campos en ambas tablas, ver supabase/schema.sql): al
// registrar una venta con Factura se copian los datos vigentes del cliente
// en ese momento, para no perder el dato histórico si el cliente los cambia
// después. Empresa NO usa este tipo: ahí razonSocial/rut son el registro
// maestro (obligatorios, sin tipoDocumento), no una copia puntual.
export interface DatosFacturacion {
  tipoDocumento?: "Boleta" | "Factura";
  razonSocial?: string;
  rut?: string;
  direccion?: string;
  giro?: string;
}

export interface Cliente extends DatosFacturacion {
  id: string;
  nombre: string;
  patente: string;
  telefono?: string;
  email?: string;
  vehiculo?: string;
  plan?: string;
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
  creadoPor?: string;
  esGarantia?: boolean;
  viaCupon?: boolean;
  cuponCodigo?: string;
  glosa?: string;
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
  notas?: string;
  // "Cuánto se pagó en el momento de la venta" — vocabulario propio de POS,
  // distinto a propósito de MovimientoContable.estado (ver más abajo): no
  // son el mismo concepto aunque ambos se llamen "estado de pago".
  estadoPago?: "pagado" | "abono50" | "pendiente";
  montoCobrado?: number;
  esServicioAdicional?: boolean;
  viaCupon?: boolean;
  cuponCodigo?: string;
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
  metodo: "efectivo" | "tarjeta" | "transferencia";
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
  // "vale" (lavado 100% gratis al canjear, comportamiento original) vs
  // "descuento" (resta del precio a cobrar; generado por el bot de WhatsApp
  // para clientes nuevos, o manualmente desde B2B/Tickets/Dsctos).
  tipo: "vale" | "descuento";
  // Solo aplica a "descuento": si es true, `valor` es un porcentaje (0-100)
  // a aplicar sobre el precio base; si es false, `valor` es un monto fijo en CLP.
  esPorcentaje?: boolean;
  // Patente a la que se le asignó el cupón antes de usarse. Solo aplica a
  // "descuento" — distinto de patenteUso, que se llena recién al canjear.
  // Si no tiene patente asignada, el descuento es "abierto" (cualquier patente).
  patenteAsignada?: string;
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
  icono?: string;
}

export interface MovimientoContable {
  id: string;
  // "cuenta_por_pagar" existió como tipo creable hasta que esa pestaña pasó
  // a derivarse de egresos con estado x_rendir/pendiente_pago (ver
  // CuentasPorPagarTab). No quedan filas con ese tipo, así que se retiró.
  // "cuenta_por_cobrar" sigue en el tipo por compatibilidad con filas
  // creadas antes de que esa pestaña pasara al mismo esquema: ahora se
  // deriva de ingresos con estado "pendiente" (ver CuentasPorCobrarTab) y
  // ya no se crea directamente.
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
  // Ciclo de vida contable del movimiento — vocabulario propio, distinto a
  // propósito de Venta.estadoPago: no se unifican porque describen cosas
  // distintas (aquí no existe un equivalente a "abono50", allá no existe
  // "x_rendir"/"pagado_cc"). Ver evaluación en supabase/schema.sql.
  estado: "pagado" | "pendiente" | "pagado_cc" | "x_rendir" | "pendiente_pago";
  // Solo aplica a tipo "ingreso" con estado "pagado": Cuentas por Cobrar
  // (ver CuentasPorCobrarTab) se deriva de los ingresos con estado
  // "pendiente", así que ahí siempre queda undefined hasta que se cobran.
  metodoPago?: "efectivo" | "tarjeta" | "transferencia";
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

// Tablas cubiertas por el log de auditoría (las que mueven dinero o datos de
// clientes). Perfiles/precios/categoriasGasto/config quedan fuera a
// propósito: bajo riesgo/volumen, ver evaluación en supabase/add-auditoria.sql.
export type TablaAuditada = "clientes" | "ingresos" | "ventas" | "empresas" | "cupones" | "movimientos_contables";

// Una entrada del log de auditoría. Es de solo escritura desde la app (no
// se carga a AppData/memoria, se revisa directo en Supabase); se genera y
// envía desde commit() en AppContext.tsx. datosAnteriores/datosNuevos son
// el snapshot completo de la fila en su forma de la app (camelCase), no la
// fila cruda de la base de datos.
export interface AuditoriaEntrada {
  tabla: TablaAuditada;
  registroId: string;
  accion: "insert" | "update" | "delete";
  datosAnteriores: unknown | null;
  datosNuevos: unknown | null;
  usuario: string | null;
}

export interface AppData {
  clientes: Cliente[];
  ingresos: Ingreso[];
  ventas: Venta[];
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
  statsDesde: string | null;
  statsHasta: string | null;
  facturaSearch: string;
  loginMode: "select" | "pin" | null;
  perfilSeleccionadoId: string | null;
  perfilActual: PerfilPublico | null;
  clientesFiltroEstado: string;
  clientesOrden: string;
}
