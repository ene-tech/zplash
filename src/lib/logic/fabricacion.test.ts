import { describe, expect, it } from "vitest";
import type { Formula, LoteMateriaPrima, MateriaPrima, Presentacion } from "@/types";
import { calcularRecepcion, compararCategoria, consumirFifo, costoEstimadoPorUnidad, filasProductosTerminados, totalesConIva, validarFormula, validarPresentacion } from "./fabricacion";

const mp = (id: string, precioFabrica?: number, unidad = "L"): MateriaPrima => ({ id, nombre: id, unidad, precioFabrica, stock: 0, stockMin: 0, activa: true });
const lote = (id: string, materiaPrimaId: string, restante: number, costoUnitario: number): LoteMateriaPrima => ({
  id,
  materiaPrimaId,
  fecha: "2026-10-01",
  cantidad: restante,
  restante,
  costoUnitario,
});

// Fragancia: nuestra, la fábrica no la pone. Alcohol: mixto. Frasco: nuestro.
const materias = [mp("fragancia"), mp("alcohol", 2500), mp("frasco", undefined, "un")];
const formulas: Formula[] = [
  {
    id: "f1",
    nombre: "Fragancia",
    componentes: [
      { id: "c1", materiaPrimaId: "fragancia", porcentaje: 10 },
      { id: "c2", materiaPrimaId: "alcohol", porcentaje: 90 },
    ],
  },
];
const pres: Presentacion[] = [
  {
    id: "p120",
    formulaId: "f1",
    productoId: "prod120",
    mlPorUnidad: 100,
    maquilaPorUnidad: 200,
    activa: true,
    componentes: [{ id: "e1", materiaPrimaId: "frasco", cantidadPorUnidad: 1 }],
  },
  { id: "p20l", formulaId: "f1", insumoId: "ins20", mlPorUnidad: 20000, maquilaPorUnidad: 3000, activa: true, componentes: [] },
];
const destinos = { productos: [{ id: "prod120", detalle: "Fragancia 100 ml" }], insumos: [{ id: "ins20", nombre: "Fragancia 20 L" }] };

describe("calcularRecepcion", () => {
  // 10 frascos de 100 ml = 1 L: 0,1 L fragancia + 0,9 L alcohol + 10 frascos.
  const lotes = [lote("fragA", "fragancia", 0.05, 20000), lote("fragB", "fragancia", 1, 30000), lote("alc", "alcohol", 0.5, 2000), lote("fra", "frasco", 50, 170)];

  it("consume FIFO lo nuestro y lo que falta lo pone la fábrica", () => {
    const r = calcularRecepcion([{ presentacionId: "p120", unidades: 10 }], pres, formulas, materias, lotes, destinos);
    if ("error" in r) throw new Error(r.error);
    expect(r.consumos).toEqual([
      { loteId: "fragA", materiaPrimaId: "fragancia", cantidad: 0.05, costoUnitario: 20000 },
      { loteId: "fragB", materiaPrimaId: "fragancia", cantidad: 0.05, costoUnitario: 30000 },
      { loteId: "alc", materiaPrimaId: "alcohol", cantidad: 0.5, costoUnitario: 2000 },
      { loteId: "fra", materiaPrimaId: "frasco", cantidad: 10, costoUnitario: 170 },
    ]);
    // 0,4 L de alcohol que faltan × $2.500
    expect(r.totalMateriasFabrica).toBe(1000);
    // fragancia 1.000 + 1.500, alcohol 1.000, frascos 1.700
    expect(r.totalPropias).toBe(5200);
    expect(r.totalMaquila).toBe(2000);
    expect(r.usos.find((u) => u.materiaPrimaId === "alcohol")).toEqual({ materiaPrimaId: "alcohol", propia: 0.5, fabrica: 0.4 });
    expect(r.faltantes).toEqual([]);
  });

  it("bloquea lo que la fábrica no pone, sumando todas las líneas", () => {
    const r = calcularRecepcion(
      [
        { presentacionId: "p20l", unidades: 1 },
        { presentacionId: "p120", unidades: 10 },
      ],
      pres,
      formulas,
      materias,
      lotes,
      destinos
    );
    if ("error" in r) throw new Error(r.error);
    // 20 L × 10% = 2 L + 0,1 L; hay 1,05 L
    expect(r.faltantes).toEqual([{ materiaPrimaId: "fragancia", nombre: "fragancia", unidad: "L", falta: 1.05 }]);
  });

  it("pide unidades enteras para productos y rechaza 0", () => {
    expect(calcularRecepcion([{ presentacionId: "p120", unidades: 1.5 }], pres, formulas, materias, lotes, destinos)).toHaveProperty("error");
    expect(calcularRecepcion([{ presentacionId: "p20l", unidades: 0 }], pres, formulas, materias, lotes, destinos)).toHaveProperty("error");
    expect(calcularRecepcion([{ presentacionId: "p20l", unidades: 0.5 }], pres, formulas, materias, [lote("f", "fragancia", 5, 1)], destinos)).not.toHaveProperty("error");
  });
});

describe("consumirFifo", () => {
  it("saca del más antiguo y avisa si no alcanza", () => {
    const lotes = [lote("a", "x", 1, 10), lote("b", "x", 2, 20)];
    expect(consumirFifo(lotes, 1.5)).toEqual([
      { loteId: "a", materiaPrimaId: "x", cantidad: 1, costoUnitario: 10 },
      { loteId: "b", materiaPrimaId: "x", cantidad: 0.5, costoUnitario: 20 },
    ]);
    expect(consumirFifo(lotes, 4)).toBeNull();
  });
});

describe("costoEstimadoPorUnidad", () => {
  it("usa el lote más antiguo o el precio de fábrica, y avisa si falta precio", () => {
    const c = costoEstimadoPorUnidad(pres[0], formulas[0], materias, [lote("fragA", "fragancia", 1, 20000)]);
    // fragancia 0,01 L × 20.000 + alcohol 0,09 L × 2.500 = 425; frasco sin lote ni precio
    expect(c).toEqual({ maquila: 200, mezcla: 425, envases: 0, materias: 425, total: 625, sinPrecio: true });
  });
});

describe("totalesConIva", () => {
  it("suma 19% sobre el neto de maquila + fábrica", () => {
    expect(totalesConIva(7500, 1250)).toEqual({ neto: 8750, iva: 1663, total: 10413 });
  });
});

describe("validaciones", () => {
  it("fórmula: no pasa de 100% ni repite materias", () => {
    const f: Formula = {
      id: "f",
      nombre: "x",
      componentes: [
        { id: "a", materiaPrimaId: "m", porcentaje: 60 },
        { id: "b", materiaPrimaId: "m", porcentaje: 50 },
      ],
    };
    expect(validarFormula(f).length).toBe(2);
    expect(validarFormula(formulas[0])).toEqual([]);
  });

  it("presentación: un solo destino y formato", () => {
    expect(validarPresentacion({ ...pres[0], insumoId: "ins20" })).toContain("Elige el producto o el insumo al que suma stock");
    expect(validarPresentacion({ ...pres[0], mlPorUnidad: 0 })).toContain("Indica el formato (ml por unidad)");
    expect(validarPresentacion(pres[0])).toEqual([]);
  });
});

describe("filasProductosTerminados", () => {
  const lotes = [lote("fragA", "fragancia", 1, 20000), lote("fra", "frasco", 50, 170)];
  const base = {
    presentaciones: pres,
    formulas: [{ ...formulas[0], categoria: "Tienda ZUPER" }],
    materias,
    lotes,
    productos: [{ id: "prod120", detalle: "Fragancia 100 ml", valorVenta: 3990, stock: 7 }],
    insumos: [{ id: "ins20", nombre: "Fragancia 20 L", stock: 2 }],
  };

  it("desglosa costo y calcula margen sobre el neto del precio con IVA", () => {
    const [f] = filasProductosTerminados({ ...base, recepciones: [] });
    // mezcla: 0,01 L × 20.000 + 0,09 L × 2.500 = 425; frasco 170; maquila 200
    expect(f).toMatchObject({ nombre: "Fragancia 100 ml", categoria: "Tienda ZUPER", mezcla: 425, envases: 170, maquila: 200, costo: 795, stock: 7 });
    expect(f).toMatchObject({ precioVenta: 3990, precioNeto: 3353, margen: 2558, margenPct: 76.3 });
  });

  it("toma el costo real de la recepción más nueva y deja los insumos sin precio de venta", () => {
    const recepciones = [
      { id: "r2", fecha: "2026-10-05", totalMaquila: 0, totalMateriasFabrica: 0, totalPropias: 0, lineas: [{ presentacionId: "p120", nombre: "x", unidades: 10, maquila: 2000, materiasFabrica: 1000, propias: 5000 }] },
      { id: "r1", fecha: "2026-10-01", totalMaquila: 0, totalMateriasFabrica: 0, totalPropias: 0, lineas: [{ presentacionId: "p120", nombre: "x", unidades: 1, maquila: 1, materiasFabrica: 1, propias: 1 }] },
    ];
    const filas = filasProductosTerminados({ ...base, recepciones });
    expect(filas.find((f) => f.presentacionId === "p120")).toMatchObject({ ultimoCostoReal: 800, ultimaRecepcion: "2026-10-05" });
    const insumo = filas.find((f) => f.presentacionId === "p20l")!;
    expect(insumo.destino).toBe("insumo");
    expect(insumo.precioVenta).toBeUndefined();
  });
});

describe("costo estimado y planilla: casos del review", () => {
  it("el estimado reparte entre lotes y precio de fábrica como una recepción", () => {
    // 1 unidad de 100 ml necesita 0,01 L de fragancia; el lote tiene 0,004 L.
    const materias2 = [mp("fragancia", 2000), mp("alcohol", 2500), mp("frasco", 100, "un")];
    const c = costoEstimadoPorUnidad(pres[0], formulas[0], materias2, [lote("fragA", "fragancia", 0.004, 20000)]);
    // fragancia 0,004 × 20.000 + 0,006 × 2.000 = 92; alcohol 0,09 × 2.500 = 225; frasco 100
    expect(c).toMatchObject({ mezcla: 317, envases: 100, total: 617, sinPrecio: false });
  });

  it("sin costo completo no hay margen", () => {
    const [f] = filasProductosTerminados({
      presentaciones: [pres[0]],
      formulas,
      materias,
      lotes: [],
      recepciones: [],
      productos: [{ id: "prod120", detalle: "Fragancia 100 ml", valorVenta: 3990, stock: 1 }],
      insumos: [],
    });
    expect(f.sinPrecio).toBe(true);
    expect(f.precioNeto).toBe(3353);
    expect(f.margen).toBeUndefined();
    expect(f.margenPct).toBeUndefined();
  });

  it("el último costo real suma todas las líneas de la misma recepción", () => {
    const recepciones = [
      {
        id: "r",
        fecha: "2026-10-08",
        totalMaquila: 0,
        totalMateriasFabrica: 0,
        totalPropias: 0,
        lineas: [
          { presentacionId: "p120", nombre: "x", unidades: 1, maquila: 1000, materiasFabrica: 0, propias: 0 },
          { presentacionId: "p120", nombre: "x", unidades: 99, maquila: 50000, materiasFabrica: 0, propias: 0 },
        ],
      },
    ];
    const [f] = filasProductosTerminados({
      presentaciones: [pres[0]],
      formulas,
      materias,
      lotes: [],
      recepciones,
      productos: [{ id: "prod120", detalle: "x", valorVenta: 0, stock: 0 }],
      insumos: [],
    });
    expect(f.ultimoCostoReal).toBe(510);
  });

  it("ordena categorías con Sin categoría al final", () => {
    expect(["Sin categoría", "Tienda", "Insumos"].sort(compararCategoria)).toEqual(["Insumos", "Tienda", "Sin categoría"]);
  });
});
