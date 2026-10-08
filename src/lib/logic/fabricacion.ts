import type { Formula, LoteMateriaPrima, MateriaPrima, Presentacion, RecepcionFabrica, RecepcionFabricaLinea } from "@/types";

/** Cantidades de materia prima con 3 decimales (ml/g si la unidad es L/kg). */
export function redondearCantidad(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const SIN_CATEGORIA = "Sin categoría";

/** Orden de categorías en todas las pestañas: alfabético, "Sin categoría" al final. */
export function compararCategoria(a: string, b: string): number {
  if (a === b) return 0;
  if (a === SIN_CATEGORIA) return 1;
  if (b === SIN_CATEGORIA) return -1;
  return a.localeCompare(b);
}

/** Cuánto de cada materia prima lleva UNA unidad por la mezcla (% del volumen, en L o kg por litro). */
function requerimientoMezcla(p: Presentacion, formula: Formula): Map<string, number> {
  const req = new Map<string, number>();
  const litros = p.mlPorUnidad / 1000;
  for (const c of formula.componentes) req.set(c.materiaPrimaId, (req.get(c.materiaPrimaId) ?? 0) + litros * (c.porcentaje / 100));
  return req;
}

/** Cuánto de cada envase (u otro ítem fijo) lleva UNA unidad. */
function requerimientoEnvases(p: Presentacion): Map<string, number> {
  const req = new Map<string, number>();
  for (const c of p.componentes) req.set(c.materiaPrimaId, (req.get(c.materiaPrimaId) ?? 0) + c.cantidadPorUnidad);
  return req;
}

/** Cuánto de cada materia prima lleva UNA unidad de la presentación: la
 * mezcla + los envases fijos. */
export function requerimientoPorUnidad(p: Presentacion, formula: Formula): Map<string, number> {
  const req = requerimientoMezcla(p, formula);
  for (const [id, cantidad] of requerimientoEnvases(p)) req.set(id, (req.get(id) ?? 0) + cantidad);
  return req;
}

/** Costo estimado de una unidad con los lotes y precios de hoy, con el
 * mismo criterio que una recepción: lo nuestro sale de los lotes en orden
 * FIFO y lo que falta lo pone la fábrica a su precio. Es una referencia; el
 * costo real queda en cada recepción. `sinPrecio` = alguna materia prima no
 * alcanza con lo nuestro y la fábrica no la pone (costo incompleto). */
export function costoEstimadoPorUnidad(p: Presentacion, formula: Formula, materias: MateriaPrima[], lotes: LoteMateriaPrima[]) {
  const mpPorId = new Map(materias.map((m) => [m.id, m]));
  let sinPrecio = false;
  const costear = (req: Map<string, number>) => {
    let total = 0;
    for (const [id, cantidad] of req) {
      let pendiente = cantidad;
      for (const l of lotes) {
        if (pendiente <= 0) break;
        if (l.materiaPrimaId !== id || l.restante <= 0) continue;
        const toma = Math.min(l.restante, pendiente);
        total += toma * l.costoUnitario;
        pendiente -= toma;
      }
      if (pendiente > 1e-9) {
        const precio = mpPorId.get(id)?.precioFabrica;
        if (precio === undefined) sinPrecio = true;
        else total += pendiente * precio;
      }
    }
    return Math.round(total);
  };
  const mezcla = costear(requerimientoMezcla(p, formula));
  const envases = costear(requerimientoEnvases(p));
  return {
    maquila: p.maquilaPorUnidad,
    mezcla,
    envases,
    materias: mezcla + envases,
    total: p.maquilaPorUnidad + mezcla + envases,
    sinPrecio,
  };
}

/** Una fila de la planilla "Productos terminados": una por presentación. */
export interface FilaProductoTerminado {
  presentacionId: string;
  categoria: string;
  formula: string;
  destino: "tienda" | "insumo";
  nombre: string;
  mlPorUnidad: number;
  activa: boolean;
  stock: number;
  /** Costo estimado hoy (neto): lote FIFO más antiguo o precio de fábrica. */
  mezcla: number;
  envases: number;
  maquila: number;
  costo: number;
  sinPrecio: boolean;
  /** Costo real (neto) de la última recepción de esta presentación. */
  ultimoCostoReal?: number;
  ultimaRecepcion?: string;
  /** Solo productos de la tienda: precio con IVA, su neto y el margen sobre
   * el neto. Sin margen si el costo está incompleto (`sinPrecio`): un margen
   * calculado con costo de menos se leería como sano. */
  precioVenta?: number;
  precioNeto?: number;
  margen?: number;
  margenPct?: number;
}

export function filasProductosTerminados(input: {
  presentaciones: Presentacion[];
  formulas: Formula[];
  materias: MateriaPrima[];
  lotes: LoteMateriaPrima[];
  /** Del más nuevo al más antiguo. */
  recepciones: RecepcionFabrica[];
  productos: { id: string; detalle: string; valorVenta: number; stock: number }[];
  insumos: { id: string; nombre: string; stock: number }[];
}): FilaProductoTerminado[] {
  const formulaPorId = new Map(input.formulas.map((f) => [f.id, f]));
  const productoPorId = new Map(input.productos.map((x) => [x.id, x]));
  const insumoPorId = new Map(input.insumos.map((x) => [x.id, x]));
  // Última recepción de cada presentación, sumando todas sus líneas en esa
  // recepción (puede venir en más de una línea).
  const ultimoReal = new Map<string, { fecha: string; costo: number; unidades: number }>();
  for (const r of input.recepciones) {
    const enEsta = new Map<string, { costo: number; unidades: number }>();
    for (const l of r.lineas) {
      if (!l.presentacionId || ultimoReal.has(l.presentacionId)) continue;
      const acc = enEsta.get(l.presentacionId) ?? { costo: 0, unidades: 0 };
      acc.costo += l.maquila + l.materiasFabrica + l.propias;
      acc.unidades += l.unidades;
      enEsta.set(l.presentacionId, acc);
    }
    for (const [id, acc] of enEsta) if (acc.unidades > 0) ultimoReal.set(id, { fecha: r.fecha, ...acc });
  }
  const filas: FilaProductoTerminado[] = [];
  for (const p of input.presentaciones) {
    const formula = formulaPorId.get(p.formulaId);
    if (!formula) continue;
    const producto = p.productoId ? productoPorId.get(p.productoId) : undefined;
    const insumo = p.insumoId ? insumoPorId.get(p.insumoId) : undefined;
    const costo = costoEstimadoPorUnidad(p, formula, input.materias, input.lotes);
    const real = ultimoReal.get(p.id);
    const fila: FilaProductoTerminado = {
      presentacionId: p.id,
      categoria: formula.categoria || SIN_CATEGORIA,
      formula: formula.nombre,
      destino: p.productoId ? "tienda" : "insumo",
      nombre: producto?.detalle ?? insumo?.nombre ?? "(borrado)",
      mlPorUnidad: p.mlPorUnidad,
      activa: p.activa,
      stock: producto?.stock ?? insumo?.stock ?? 0,
      mezcla: costo.mezcla,
      envases: costo.envases,
      maquila: costo.maquila,
      costo: costo.total,
      sinPrecio: costo.sinPrecio,
      ultimoCostoReal: real ? Math.round(real.costo / real.unidades) : undefined,
      ultimaRecepcion: real?.fecha,
    };
    if (producto && producto.valorVenta > 0) {
      // valorVenta se guarda bruto (IVA incluido), igual que en el POS.
      const neto = Math.round(producto.valorVenta / 1.19);
      fila.precioVenta = producto.valorVenta;
      fila.precioNeto = neto;
      if (!costo.sinPrecio) {
        fila.margen = neto - costo.total;
        fila.margenPct = Math.round(((neto - costo.total) / neto) * 1000) / 10;
      }
    }
    filas.push(fila);
  }
  return filas.sort((a, b) => compararCategoria(a.categoria, b.categoria) || a.nombre.localeCompare(b.nombre));
}

export interface LineaRecepcionInput {
  presentacionId: string;
  unidades: number;
}

/** Lo que sale de un lote nuestro para una recepción. */
export interface ConsumoLote {
  loteId: string;
  materiaPrimaId: string;
  cantidad: number;
  costoUnitario: number;
}

export interface Faltante {
  materiaPrimaId: string;
  nombre: string;
  unidad: string;
  falta: number;
}

/** Por materia prima: cuánto sale de lo nuestro y cuánto pone la fábrica. */
export interface UsoMateriaPrima {
  materiaPrimaId: string;
  propia: number;
  fabrica: number;
}

export interface RecepcionCalculada {
  lineas: RecepcionFabricaLinea[];
  consumos: ConsumoLote[];
  usos: UsoMateriaPrima[];
  faltantes: Faltante[];
  totalMaquila: number;
  totalMateriasFabrica: number;
  totalPropias: number;
}

/** Arma una recepción. Por cada materia prima se consume primero lo nuestro,
 * del lote más antiguo (FIFO); lo que falta lo pone la fábrica a su precio.
 * Si la fábrica no la pone, queda en `faltantes` y no se debe guardar.
 * `lotes` deben venir del más antiguo al más nuevo. */
export function calcularRecepcion(
  input: LineaRecepcionInput[],
  presentaciones: Presentacion[],
  formulas: Formula[],
  materias: MateriaPrima[],
  lotes: LoteMateriaPrima[],
  destinos: { productos: { id: string; detalle: string }[]; insumos: { id: string; nombre: string }[] }
): RecepcionCalculada | { error: string } {
  const presPorId = new Map(presentaciones.map((p) => [p.id, p]));
  const formulaPorId = new Map(formulas.map((f) => [f.id, f]));
  const mpPorId = new Map(materias.map((m) => [m.id, m]));
  // Copia: el cálculo va descontando saldo a medida que avanza por las líneas.
  const saldo = lotes.filter((l) => l.restante > 0).map((l) => ({ ...l }));

  const lineas: RecepcionFabricaLinea[] = [];
  const consumos = new Map<string, ConsumoLote>();
  const usos = new Map<string, UsoMateriaPrima>();
  const faltan = new Map<string, number>();

  for (const l of input) {
    const p = presPorId.get(l.presentacionId);
    if (!p) return { error: "Una de las presentaciones ya no existe" };
    const formula = formulaPorId.get(p.formulaId);
    if (!formula) return { error: "La fórmula de una presentación ya no existe" };
    const nombre = p.productoId
      ? destinos.productos.find((x) => x.id === p.productoId)?.detalle
      : destinos.insumos.find((x) => x.id === p.insumoId)?.nombre;
    if (!nombre) return { error: "El producto o insumo de una presentación ya no existe" };
    if (!(l.unidades > 0)) return { error: `Indica las unidades recibidas de ${nombre}` };
    if (p.productoId && !Number.isInteger(l.unidades)) return { error: `${nombre} se recibe en unidades enteras` };

    let materiasFabrica = 0;
    let propias = 0;
    for (const [mpId, porUnidad] of requerimientoPorUnidad(p, formula)) {
      const mp = mpPorId.get(mpId);
      if (!mp) return { error: `La fórmula de ${nombre} usa una materia prima que ya no existe` };
      let pendiente = redondearCantidad(porUnidad * l.unidades);
      const uso = usos.get(mpId) ?? { materiaPrimaId: mpId, propia: 0, fabrica: 0 };
      for (const lote of saldo) {
        if (pendiente <= 0) break;
        if (lote.materiaPrimaId !== mpId || lote.restante <= 0) continue;
        const toma = redondearCantidad(Math.min(lote.restante, pendiente));
        lote.restante = redondearCantidad(lote.restante - toma);
        pendiente = redondearCantidad(pendiente - toma);
        propias += toma * lote.costoUnitario;
        uso.propia = redondearCantidad(uso.propia + toma);
        const c = consumos.get(lote.id) ?? { loteId: lote.id, materiaPrimaId: mpId, cantidad: 0, costoUnitario: lote.costoUnitario };
        c.cantidad = redondearCantidad(c.cantidad + toma);
        consumos.set(lote.id, c);
      }
      if (pendiente > 0) {
        if (mp.precioFabrica === undefined) faltan.set(mpId, redondearCantidad((faltan.get(mpId) ?? 0) + pendiente));
        else {
          materiasFabrica += pendiente * mp.precioFabrica;
          uso.fabrica = redondearCantidad(uso.fabrica + pendiente);
        }
      }
      usos.set(mpId, uso);
    }
    lineas.push({
      presentacionId: p.id,
      productoId: p.productoId,
      insumoId: p.insumoId,
      nombre,
      unidades: l.unidades,
      maquila: Math.round(l.unidades * p.maquilaPorUnidad),
      materiasFabrica: Math.round(materiasFabrica),
      propias: Math.round(propias),
    });
  }

  return {
    lineas,
    consumos: [...consumos.values()],
    usos: [...usos.values()],
    faltantes: [...faltan].map(([id, falta]) => {
      const mp = mpPorId.get(id)!;
      return { materiaPrimaId: id, nombre: mp.nombre, unidad: mp.unidad, falta };
    }),
    totalMaquila: lineas.reduce((s, l) => s + l.maquila, 0),
    totalMateriasFabrica: lineas.reduce((s, l) => s + l.materiasFabrica, 0),
    totalPropias: lineas.reduce((s, l) => s + l.propias, 0),
  };
}

/** Saca `cantidad` de los lotes FIFO (para un ajuste negativo). Devuelve qué
 * sale de cada lote, o null si no alcanza. */
export function consumirFifo(lotes: LoteMateriaPrima[], cantidad: number): ConsumoLote[] | null {
  let pendiente = redondearCantidad(cantidad);
  const out: ConsumoLote[] = [];
  for (const l of lotes) {
    if (pendiente <= 0) break;
    if (l.restante <= 0) continue;
    const toma = redondearCantidad(Math.min(l.restante, pendiente));
    out.push({ loteId: l.id, materiaPrimaId: l.materiaPrimaId, cantidad: toma, costoUnitario: l.costoUnitario });
    pendiente = redondearCantidad(pendiente - toma);
  }
  return pendiente > 0 ? null : out;
}

/** La maquila y los precios de la fábrica son NETOS; la factura (y el egreso
 * en Contabilidad, que siempre va bruto) lleva IVA encima. */
export function totalesConIva(totalMaquila: number, totalMateriasFabrica: number) {
  const neto = totalMaquila + totalMateriasFabrica;
  const iva = Math.round(neto * 0.19);
  return { neto, iva, total: neto + iva };
}

/** Problemas de una mezcla antes de guardarla (lista vacía = válida). */
export function validarFormula(formula: Formula): string[] {
  const errores: string[] = [];
  if (!formula.nombre.trim()) errores.push("Falta el nombre de la fórmula");
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

export function validarPresentacion(p: Presentacion): string[] {
  const errores: string[] = [];
  if (!p.productoId === !p.insumoId) errores.push("Elige el producto o el insumo al que suma stock");
  if (!(p.mlPorUnidad > 0)) errores.push("Indica el formato (ml por unidad)");
  if (p.maquilaPorUnidad < 0) errores.push("La maquila no puede ser negativa");
  const ids = new Set<string>();
  for (const c of p.componentes) {
    if (!c.materiaPrimaId) errores.push("Hay un envase sin elegir");
    else if (ids.has(c.materiaPrimaId)) errores.push("Un envase está repetido");
    ids.add(c.materiaPrimaId);
    if (!(c.cantidadPorUnidad > 0)) errores.push("Cada envase necesita una cantidad por unidad mayor a 0");
  }
  return errores;
}
