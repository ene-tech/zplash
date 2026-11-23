import { describe, expect, it } from "vitest";
import type { Cupon } from "@/types";
import { cuponDescuentoDePatente, fmtDiasSemana, inicioDelDiaSantiago, resolverDescuento, restriccionDeUso } from "./cupones";

// Viernes 27-nov-2026, 15:00 en Chile (UTC-3 en verano).
const VIERNES = new Date("2026-11-27T18:00:00Z");

function cupon(p: Partial<Cupon> = {}): Cupon {
  return {
    id: "c1",
    codigo: "ABC234",
    nombreLote: "Prueba",
    valor: 2000,
    numeroLote: 1,
    totalLote: 1,
    fechaCaducidad: "2026-12-31T23:59:59-03:00",
    usado: false,
    creadoEn: "2026-11-20T12:00:00Z",
    tipo: "vale",
    ...p,
  };
}

describe("fmtDiasSemana", () => {
  it("lee rangos, listas y un solo día", () => {
    expect(fmtDiasSemana([1, 2, 3, 4])).toBe("de lunes a jueves");
    expect(fmtDiasSemana([5, 1, 3])).toBe("lunes, miércoles y viernes");
    expect(fmtDiasSemana([6, 0])).toBe("sábado y domingo");
    expect(fmtDiasSemana([6])).toBe("los sábados");
    expect(fmtDiasSemana([])).toBe("todos los días");
  });
});

describe("inicioDelDiaSantiago", () => {
  it("es la medianoche de Chile", () => {
    expect(inicioDelDiaSantiago("2026-11-30")).toBe("2026-11-30T03:00:00.000Z");
  });
});

describe("restriccionDeUso", () => {
  it("sin reglas se puede usar", () => {
    expect(restriccionDeUso(cupon(), VIERNES)).toBeUndefined();
  });

  it("antes de su inicio dice desde cuándo y qué días", () => {
    const c = cupon({ validoDesde: inicioDelDiaSantiago("2026-11-30"), diasSemana: [1, 2, 3, 4] });
    expect(restriccionDeUso(c, VIERNES)).toBe("Este ticket está vigente a partir del lunes 30-11-2026, de lunes a jueves");
  });

  it("el mismo día de inicio ya sirve", () => {
    const c = cupon({ validoDesde: inicioDelDiaSantiago("2026-11-27") });
    expect(restriccionDeUso(c, VIERNES)).toBeUndefined();
  });

  it("un día no permitido dice cuál es el próximo", () => {
    const c = cupon({ tipo: "descuento", diasSemana: [1, 2, 3, 4] });
    expect(restriccionDeUso(c, VIERNES)).toBe(
      "Este descuento se puede usar solo de lunes a jueves y hoy es viernes: el próximo día que sirve es el lunes 30-11-2026"
    );
  });

  it("avisa si ya no le queda día válido antes de caducar", () => {
    const c = cupon({ diasSemana: [1], fechaCaducidad: "2026-11-29T23:59:59-03:00" });
    expect(restriccionDeUso(c, VIERNES)).toMatch(/ya no le queda ningún día válido/);
  });
});

describe("descuentos con días", () => {
  const d = cupon({ tipo: "descuento", patenteAsignada: "ABCD12", diasSemana: [1, 2, 3, 4] });

  it("no se aplica solo por patente un día no permitido", () => {
    expect(cuponDescuentoDePatente([d], "ABCD12", "local", VIERNES)).toBeUndefined();
    expect(cuponDescuentoDePatente([d], "ABCD12", "web", new Date("2026-11-30T18:00:00Z"))).toBeDefined();
  });

  it("tipeado devuelve el motivo", () => {
    const futuro = { ...d, diasSemana: undefined, validoDesde: inicioDelDiaSantiago("2099-01-05"), fechaCaducidad: "2099-12-31T23:59:59-03:00" };
    const r = resolverDescuento("ABC234", "ABCD12", [futuro], []);
    expect(r).toEqual({ ok: false, msg: "Este descuento está vigente a partir del lunes 05-01-2099" });
  });
});
