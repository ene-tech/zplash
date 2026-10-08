// Fabricación por maquila (ver src/db/schema/inventario/fabricacion.ts).
// Una Formula es la mezcla (en %); cada Presentacion es un formato de esa
// mezcla (20 L, 500 ml…) que suma stock a un Producto del POS o a un Insumo.
// Las materias primas son mixtas: primero se usa lo nuestro (lotes, costo
// FIFO) y lo que falta lo pone la fábrica a `precioFabrica`.
export interface MateriaPrima {
  id: string;
  nombre: string;
  unidad: string;
  /** Neto por unidad. undefined = la fábrica no la pone. */
  precioFabrica?: number;
  /** Lo nuestro guardado en la fábrica (suma de lotes). */
  stock: number;
  stockMin: number;
  activa: boolean;
}

export interface LoteMateriaPrima {
  id: string;
  materiaPrimaId: string;
  fecha: string;
  cantidad: number;
  restante: number;
  costoUnitario: number;
  notas?: string;
}

export interface FormulaComponente {
  id: string;
  materiaPrimaId: string;
  porcentaje: number;
}

export interface Formula {
  id: string;
  nombre: string;
  /** Texto libre para agrupar en pantalla. */
  categoria?: string;
  notas?: string;
  componentes: FormulaComponente[];
}

export interface PresentacionComponente {
  id: string;
  materiaPrimaId: string;
  cantidadPorUnidad: number;
}

export interface Presentacion {
  id: string;
  formulaId: string;
  productoId?: string;
  insumoId?: string;
  mlPorUnidad: number;
  maquilaPorUnidad: number;
  activa: boolean;
  /** Envases y otros ítems fijos por unidad. */
  componentes: PresentacionComponente[];
}

export interface RecepcionFabricaLinea {
  presentacionId?: string;
  productoId?: string;
  insumoId?: string;
  nombre: string;
  unidades: number;
  maquila: number;
  materiasFabrica: number;
  /** Costo FIFO de lo nuestro consumido en esta línea. */
  propias: number;
}

export interface RecepcionFabrica {
  id: string;
  fecha: string;
  proveedorId?: string;
  numeroDocumento?: string;
  totalMaquila: number;
  totalMateriasFabrica: number;
  totalPropias: number;
  movimientoContableId?: string;
  notas?: string;
  creadoPor?: string;
  lineas: RecepcionFabricaLinea[];
}

export type TipoMovimientoMateriaPrima = "compra" | "consumo" | "ajuste";

export interface MovimientoMateriaPrima {
  id: string;
  materiaPrimaId: string;
  loteId?: string;
  fecha: string;
  tipo: TipoMovimientoMateriaPrima;
  /** Con signo: positivo entra, negativo sale. */
  cantidad: number;
  costoUnitario: number;
  recepcionId?: string;
  notas?: string;
  creadoPor?: string;
}

export interface DatosFabricacion {
  materiasPrimas: MateriaPrima[];
  /** Solo lotes con saldo, del más antiguo al más nuevo. */
  lotes: LoteMateriaPrima[];
  formulas: Formula[];
  presentaciones: Presentacion[];
  recepciones: RecepcionFabrica[];
  movimientos: MovimientoMateriaPrima[];
}
