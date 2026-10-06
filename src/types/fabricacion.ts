// Fabricación por maquila (ver src/db/schema/inventario/fabricacion.ts): los
// químicos terminados son Insumos; sus fórmulas dicen qué % de cada materia
// prima llevan. Las materias primas propias se descuentan al recibir; las de
// la fábrica se pagan, junto con la maquila por litro.
export interface MateriaPrima {
  id: string;
  nombre: string;
  unidad: string;
  propia: boolean;
  costoUnitario: number;
  stock: number;
  stockMin: number;
  activa: boolean;
}

export interface FormulaComponente {
  id: string;
  materiaPrimaId: string;
  porcentaje: number;
}

export interface Formula {
  id: string;
  insumoId: string;
  maquilaPorLitro: number;
  notas?: string;
  componentes: FormulaComponente[];
}

export interface RecepcionFabricaLinea {
  insumoId?: string;
  insumoNombre: string;
  litros: number;
  maquila: number;
  materiasFabrica: number;
}

export interface RecepcionFabrica {
  id: string;
  fecha: string;
  proveedorId?: string;
  numeroDocumento?: string;
  totalMaquila: number;
  totalMateriasFabrica: number;
  movimientoContableId?: string;
  notas?: string;
  creadoPor?: string;
  lineas: RecepcionFabricaLinea[];
}

export type TipoMovimientoMateriaPrima = "compra" | "consumo" | "ajuste";

export interface MovimientoMateriaPrima {
  id: string;
  materiaPrimaId: string;
  fecha: string;
  tipo: TipoMovimientoMateriaPrima;
  /** Con signo: positivo entra, negativo sale. */
  cantidad: number;
  recepcionId?: string;
  notas?: string;
  creadoPor?: string;
}

export interface DatosFabricacion {
  materiasPrimas: MateriaPrima[];
  formulas: Formula[];
  recepciones: RecepcionFabrica[];
  movimientos: MovimientoMateriaPrima[];
}
