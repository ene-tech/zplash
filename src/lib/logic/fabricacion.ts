import type { Formula, MateriaPrima, RecepcionFabricaLinea } from "@/types";

/** Cantidades de materia prima con 3 decimales (gramos/ml si la unidad es kg/L). */
export function redondearCantidad(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface LineaRecepcionInput {
  insumoId: string;
  litros: number;
}

export interface Faltante {
  materiaPrimaId: string;
  nombre: string;
  unidad: string;
  necesita: number;
  hay: number;
}

export interface RecepcionCalculada {
  lineas: RecepcionFabricaLinea[];
  /** Cuánto se descuenta de cada materia prima propia (positivo). */
  consumos: Map<string, number>;
  faltantes: Faltante[];
  totalMaquila: number;
  totalMateriasFabrica: number;
}

/** Costo por litro de una fórmula: maquila + lo que cobra la fábrica + el
 * costo de nuestras propias materias primas (este último no se paga al
 * recibir, ya se pagó al comprarlas, pero sirve para saber cuánto cuesta el
 * litro de verdad). */
export function costoPorLitro(formula: Formula, materias: MateriaPrima[]) {
  const porId = new Map(materias.map((m) => [m.id, m]));
  let fabrica = 0;
  let propias = 0;
  for (const c of formula.componentes) {
    const mp = porId.get(c.materiaPrimaId);
    if (!mp) continue;
    const costo = (c.porcentaje / 100) * mp.costoUnitario;
    if (mp.propia) propias += costo;
    else fabrica += costo;
  }
  return { maquila: formula.maquilaPorLitro, fabrica, propias, total: formula.maquilaPorLitro + fabrica + propias };
}

/** Arma una recepción: cuánto se paga (maquila + materias que pone la
 * fábrica, en pesos enteros por línea) y cuánto se descuenta de cada materia
 * prima propia. Si alguna propia no alcanza queda en `faltantes` y la
 * recepción no se debe guardar. */
export function calcularRecepcion(
  input: LineaRecepcionInput[],
  formulas: Formula[],
  materias: MateriaPrima[],
  insumos: { id: string; nombre: string }[]
): RecepcionCalculada | { error: string } {
  const formulaPorInsumo = new Map(formulas.map((f) => [f.insumoId, f]));
  const mpPorId = new Map(materias.map((m) => [m.id, m]));
  const nombreInsumo = new Map(insumos.map((i) => [i.id, i.nombre]));

  const lineas: RecepcionFabricaLinea[] = [];
  const consumos = new Map<string, number>();

  for (const l of input) {
    const nombre = nombreInsumo.get(l.insumoId);
    if (!nombre) return { error: "Uno de los productos ya no existe en Insumos" };
    if (!(l.litros > 0)) return { error: `Indica los litros recibidos de ${nombre}` };
    const formula = formulaPorInsumo.get(l.insumoId);
    if (!formula) return { error: `${nombre} no tiene fórmula: créala en la pestaña Fórmulas antes de recibirlo` };

    let materiasFabrica = 0;
    for (const c of formula.componentes) {
      const mp = mpPorId.get(c.materiaPrimaId);
      if (!mp) return { error: `La fórmula de ${nombre} usa una materia prima que ya no existe` };
      const cantidad = l.litros * (c.porcentaje / 100);
      if (mp.propia) consumos.set(mp.id, (consumos.get(mp.id) ?? 0) + cantidad);
      else materiasFabrica += cantidad * mp.costoUnitario;
    }
    lineas.push({
      insumoId: l.insumoId,
      insumoNombre: nombre,
      litros: l.litros,
      maquila: Math.round(l.litros * formula.maquilaPorLitro),
      materiasFabrica: Math.round(materiasFabrica),
    });
  }

  for (const [id, cantidad] of consumos) consumos.set(id, redondearCantidad(cantidad));

  const faltantes: Faltante[] = [];
  for (const [id, necesita] of consumos) {
    const mp = mpPorId.get(id)!;
    if (necesita > mp.stock) faltantes.push({ materiaPrimaId: id, nombre: mp.nombre, unidad: mp.unidad, necesita, hay: mp.stock });
  }

  return {
    lineas,
    consumos,
    faltantes,
    totalMaquila: lineas.reduce((s, l) => s + l.maquila, 0),
    totalMateriasFabrica: lineas.reduce((s, l) => s + l.materiasFabrica, 0),
  };
}

/** Problemas de una fórmula antes de guardarla (lista vacía = válida). */
export function validarFormula(formula: Formula): string[] {
  const errores: string[] = [];
  if (formula.maquilaPorLitro < 0) errores.push("La maquila no puede ser negativa");
  const ids = new Set<string>();
  let suma = 0;
  for (const c of formula.componentes) {
    if (!c.materiaPrimaId) errores.push("Hay un componente sin materia prima");
    else if (ids.has(c.materiaPrimaId)) errores.push("Una materia prima está repetida en la fórmula");
    ids.add(c.materiaPrimaId);
    if (!(c.porcentaje > 0)) errores.push("Cada componente necesita un % mayor a 0");
    suma += c.porcentaje || 0;
  }
  if (suma > 100.0001) errores.push(`Los componentes suman ${redondearCantidad(suma)}%: no pueden pasar de 100%`);
  return errores;
}
