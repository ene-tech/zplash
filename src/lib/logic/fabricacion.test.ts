import { describe, expect, it } from "vitest";
import type { Formula, MateriaPrima } from "@/types";
import { calcularRecepcion, costoPorLitro, validarFormula } from "./fabricacion";

const mp = (id: string, propia: boolean, costoUnitario: number, stock = 0): MateriaPrima => ({
  id,
  nombre: id,
  unidad: "kg",
  propia,
  costoUnitario,
  stock,
  stockMin: 0,
  activa: true,
});

const materias = [mp("tensoactivo", true, 2000, 10), mp("fragancia", false, 5000)];
const formulas: Formula[] = [
  {
    id: "f1",
    insumoId: "shampoo",
    maquilaPorLitro: 150,
    componentes: [
      { id: "c1", materiaPrimaId: "tensoactivo", porcentaje: 2 },
      { id: "c2", materiaPrimaId: "fragancia", porcentaje: 0.5 },
    ],
  },
];
const insumos = [{ id: "shampoo", nombre: "Shampoo" }, { id: "cera", nombre: "Cera" }];

describe("calcularRecepcion", () => {
  it("descuenta las propias por % y cobra maquila + materias de la fábrica", () => {
    const r = calcularRecepcion([{ insumoId: "shampoo", litros: 100 }], formulas, materias, insumos);
    if ("error" in r) throw new Error(r.error);
    expect(r.consumos.get("tensoactivo")).toBe(2);
    expect(r.consumos.has("fragancia")).toBe(false);
    expect(r.totalMaquila).toBe(15000);
    // 100 L × 0,5% = 0,5 kg × $5.000
    expect(r.totalMateriasFabrica).toBe(2500);
    expect(r.faltantes).toEqual([]);
  });

  it("marca faltante cuando la materia prima propia no alcanza, sumando todas las líneas", () => {
    const r = calcularRecepcion(
      [
        { insumoId: "shampoo", litros: 300 },
        { insumoId: "shampoo", litros: 250 },
      ],
      formulas,
      materias,
      insumos
    );
    if ("error" in r) throw new Error(r.error);
    expect(r.faltantes).toEqual([{ materiaPrimaId: "tensoactivo", nombre: "tensoactivo", unidad: "kg", necesita: 11, hay: 10 }]);
  });

  it("rechaza un insumo sin fórmula o sin litros", () => {
    expect(calcularRecepcion([{ insumoId: "cera", litros: 10 }], formulas, materias, insumos)).toHaveProperty("error");
    expect(calcularRecepcion([{ insumoId: "shampoo", litros: 0 }], formulas, materias, insumos)).toHaveProperty("error");
  });
});

describe("costoPorLitro", () => {
  it("separa maquila, fábrica y propias", () => {
    expect(costoPorLitro(formulas[0], materias)).toEqual({ maquila: 150, fabrica: 25, propias: 40, total: 215 });
  });
});

describe("validarFormula", () => {
  it("no deja pasar de 100% ni repetir materias", () => {
    const f: Formula = {
      id: "f",
      insumoId: "x",
      maquilaPorLitro: 0,
      componentes: [
        { id: "a", materiaPrimaId: "m", porcentaje: 60 },
        { id: "b", materiaPrimaId: "m", porcentaje: 50 },
      ],
    };
    expect(validarFormula(f).length).toBe(2);
    expect(validarFormula(formulas[0])).toEqual([]);
  });
});
