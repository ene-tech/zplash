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
  estado: "pagado" | "pendiente" | "pagado_cc" | "pagado_efectivo" | "x_rendir" | "pendiente_pago";
  // Solo aplica a tipo "ingreso" con estado "pagado": Cuentas por Cobrar
  // (ver CuentasPorCobrarTab) se deriva de los ingresos con estado
  // "pendiente", así que ahí siempre queda undefined hasta que se cobran.
  metodoPago?: "efectivo" | "tarjeta" | "transferencia";
  notas?: string;
  creadoEn: string;
  creadoPor?: string;
  // Se fija automáticamente al pasar a un estado "pagado*" (nunca manual).
  fechaPago?: string;
  // Presente solo en movimientos "ingreso" generados automáticamente a
  // partir de una Venta (ver movimientoContableDesdeVenta en helpers.ts) —
  // permite que CierreTab excluya estas filas de su bucket manual sin
  // duplicar el monto que ya cuenta directo desde `Venta`.
  ventaId?: string;
}

// Línea individual importada de una cartola bancaria (ver
// @/lib/cartolaParser y ConciliacionBancariaTab). `categoria` es una
// taxonomía propia (ej. "Ingreso Tarjeta POS (GETNET)"), asignada por una
// ReglaConciliacion o a mano — no tiene relación con
// MovimientoContable.categoria (esa sigue el EERR).
export interface CartolaMovimiento {
  id: string;
  cuenta: string;
  fecha: string;
  glosa: string;
  cargo: number;
  abono: number;
  saldo?: number;
  numeroDocumento?: string;
  sucursal?: string;
  categoria?: string;
  estado: "pendiente" | "conciliado" | "ignorado";
  movimientoContableId?: string;
  notas?: string;
  creadoEn: string;
  creadoPor?: string;
}

// Regla "aprendida" para clasificar automáticamente futuras líneas de
// cartola cuya glosa contenga `id` (case-insensitive) — ver importarCartola
// en @/lib/actions. `id` es el propio patrón (ej. "GETNET").
export interface ReglaConciliacion {
  id: string;
  categoria: string;
  creadoEn: string;
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

// Canal seleccionable para el formulario de Ingresos (Contabilidad → Ingresos)
// — identifica de dónde vino la plata (Túnel, Venta a Empresa, etc.), igual
// que CategoriaGasto identifica el tipo de gasto. A diferencia de
// CategoriaGasto no tiene "grupo": el EERR hoy no desglosa los ingresos de
// explotación por canal (ver EERRTab.tsx), solo los suma.
export interface CategoriaIngreso {
  id: string;
  nombre: string;
  activa: boolean;
}
