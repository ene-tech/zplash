import type { MovimientoContable } from "@/types";

/**
 * Estructura del Estado de Resultados (EERR): los 5 grupos de gasto y a qué
 * sección pertenecen (operacional / no operacional) son fijos — vienen del
 * formato de EERR entregado por el usuario y determinan qué suma y qué
 * resta en el reporte. Lo que SÍ es editable son las glosas (categorías)
 * dentro de cada grupo — ver CategoriaGasto en types.ts y la tabla
 * categorias_gasto.
 */
export interface GrupoGastoEERR {
  grupo: string;
  seccion: "operacional" | "no_operacional";
}

export const GRUPOS_GASTO_EERR: GrupoGastoEERR[] = [
  { grupo: "Otros Costos Directos", seccion: "operacional" },
  { grupo: "Gasto de Remuneraciones", seccion: "operacional" },
  { grupo: "Gastos de Administración", seccion: "operacional" },
  { grupo: "Gastos Financieros Bancarios", seccion: "no_operacional" },
  { grupo: "Otros Egresos Fuera de la Explotación", seccion: "no_operacional" },
];

/** Semilla/fallback para cuando la tabla categorias_gasto está vacía o la
 * migración todavía no corrió — mismo patrón que PERFILES_DEFAULT. */
export const CATEGORIAS_GASTO_DEFAULT: { id: string; nombre: string; grupo: string; activa: boolean }[] = [
  { id: "cg-comisiones-por-venta", nombre: "Comisiones por Venta", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-insumos-de-lavado", nombre: "Insumos de Lavado", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-mantencion-maquinarias", nombre: "Mantención de Maquinarias", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-mantencion-instalaciones", nombre: "Mantención de Instalaciones", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-aseo-limpieza", nombre: "Aseo y Limpieza", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-electricidad", nombre: "Gastos de Electricidad", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-agua-potable", nombre: "Gastos de Agua Potable", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-ropa-utiles", nombre: "Ropa y Útiles de Trabajo", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-combustibles", nombre: "Gastos de Combustibles", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-otros-gastos-directos", nombre: "Otros Gastos Directos", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-sueldo-base", nombre: "Sueldo Base", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-gratificacion", nombre: "Gratificación", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-aguinaldos", nombre: "Aguinaldos", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-aporte-patronal", nombre: "Aporte Patronal", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-servicios-terceros", nombre: "Servicios de Terceros", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-vacaciones", nombre: "Vacaciones", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-honorarios-profesionales", nombre: "Honorarios Profesionales", grupo: "Gastos de Administración", activa: true },
  { id: "cg-gastos-notariales", nombre: "Gastos Notariales", grupo: "Gastos de Administración", activa: true },
  { id: "cg-articulos-oficina", nombre: "Gastos y Artículos de Oficina", grupo: "Gastos de Administración", activa: true },
  { id: "cg-publicidad-papeleria", nombre: "Gastos de Publicidad - Papelería", grupo: "Gastos de Administración", activa: true },
  {
    id: "cg-internet-transmision",
    nombre: "Gastos de Internet y Transmisión de Datos",
    grupo: "Gastos de Administración",
    activa: true,
  },
  { id: "cg-fletes-embalajes", nombre: "Fletes y Embalajes", grupo: "Gastos de Administración", activa: true },
  { id: "cg-seguros", nombre: "Seguros", grupo: "Gastos de Administración", activa: true },
  { id: "cg-arriendos", nombre: "Arriendos", grupo: "Gastos de Administración", activa: true },
  { id: "cg-pasajes-peajes", nombre: "Gastos de Pasajes - Peajes", grupo: "Gastos de Administración", activa: true },
  { id: "cg-cafeteria", nombre: "Gastos de Cafetería y Similares", grupo: "Gastos de Administración", activa: true },
  { id: "cg-seguridad", nombre: "Gastos en Seguridad", grupo: "Gastos de Administración", activa: true },
  { id: "cg-gastos-bancarios", nombre: "Gastos Bancarios", grupo: "Gastos Financieros Bancarios", activa: true },
  {
    id: "cg-costo-venta-activos-fijos",
    nombre: "Costo de Venta por Enajenación de Activos Fijos",
    grupo: "Otros Egresos Fuera de la Explotación",
    activa: true,
  },
];

/** Grupo de una categoría de gasto ya cargada; si no calza con ninguna
 * conocida (dato antiguo, o la categoría fue borrada) cae en "Otros Costos
 * Directos" para no perder el monto del EERR. */
export function categoriaAGrupo(categorias: { nombre: string; grupo: string }[], nombre: string): string {
  return categorias.find((c) => c.nombre === nombre)?.grupo || "Otros Costos Directos";
}

/** Nombres de los dos canales de ingreso con comportamiento especial en
 * MovimientoContableTab: el Túnel siempre se registra como "Pagado" (no
 * puede quedar pendiente) y "Otros" agrega un comentario libre a la
 * descripción. Se referencian por nombre (no por posición en la lista) para
 * que sigan funcionando aunque se agreguen/reordenen otros canales. */
export const CANAL_INGRESO_TUNEL = "Servicios de Lavado / Túnel";
export const CANAL_INGRESO_OTROS = "Otros";

/** Semilla/fallback para cuando la tabla categorias_ingreso está vacía o la
 * migración todavía no corrió — mismo patrón que CATEGORIAS_GASTO_DEFAULT. */
export const CATEGORIAS_INGRESO_DEFAULT: { id: string; nombre: string; activa: boolean }[] = [
  { id: "ci-tunel", nombre: CANAL_INGRESO_TUNEL, activa: true },
  { id: "ci-otros", nombre: CANAL_INGRESO_OTROS, activa: true },
];

/** Id determinístico para el MovimientoContable derivado de una Venta: como
 * upsertMovimientosContables hace upsert por id, volver a llamar a esta
 * función para la misma venta (p. ej. al cobrar un saldo pendiente)
 * simplemente sobreescribe la misma fila en vez de duplicarla. */
export function idMovimientoContableDeVenta(ventaId: string): string {
  return "mc-venta-" + ventaId;
}

/** Deriva el movimiento contable (ingreso) que corresponde a una Venta, para
 * que el EERR y Contabilidad → Ingresos se completen solos sin que alguien
 * tenga que volver a tipear cada venta a mano (ver EERRTab/MovimientoContableTab).
 * "estadoPago" sin definir siempre significó "pagado al momento" en los
 * flujos existentes (ver OperadorResult), así que solo "pendiente"/"abono50"
 * cuentan como no cobrado todavía.
 * Devuelve null si el precio quedó en $0 (cupón/descuento de 100%): no hubo
 * ingreso real que registrar en Contabilidad, así que no corresponde crear el
 * movimiento (ver pedirPago en useIngresoActions/usePlanActions/
 * useOperadorNotFoundResult, que por el mismo motivo tampoco piden medio de
 * pago cuando el monto es $0). */
export function movimientoContableDesdeVenta(venta: {
  id: string;
  tipo: string;
  precio: number;
  fecha: string;
  patente: string;
  nombre: string;
  metodoPago?: string | null;
  estadoPago?: string | null;
  creadoPor?: string | null;
}): MovimientoContable | null {
  if (venta.precio <= 0) return null;
  const pagado = venta.estadoPago !== "pendiente" && venta.estadoPago !== "abono50";
  return {
    id: idMovimientoContableDeVenta(venta.id),
    tipo: "ingreso",
    fecha: venta.fecha,
    descripcion: `${venta.tipo} – ${venta.nombre} (${venta.patente})`,
    categoria: CANAL_INGRESO_TUNEL,
    contraparte: venta.nombre,
    monto: venta.precio,
    estado: pagado ? "pagado" : "pendiente",
    metodoPago: pagado ? (venta.metodoPago as MovimientoContable["metodoPago"]) || undefined : undefined,
    creadoEn: new Date().toISOString(),
    creadoPor: venta.creadoPor || undefined,
    ventaId: venta.id,
  };
}

export function esEstadoPagadoEgreso(estado: string): boolean {
  return estado === "pagado_cc" || estado === "pagado_efectivo";
}
