import { describe, expect, it } from "vitest";
import { acumularPremio, loteReferido, lotePremioReferido, premioAcumulado, premiosPendientes, rechazoCodigoReferido, referidosDePatente } from "./referidos";

describe("premiosPendientes", () => {
  it("premia una sola vez por cupón de amigo e ignora los que no son referidos", () => {
    const usados = [
      { codigo: "AAA111", nombreLote: loteReferido("AB1234") },
      { codigo: "BBB222", nombreLote: loteReferido("AB1234") },
      { codigo: "CCC333", nombreLote: "Web - Primera vez" },
    ];
    const pendientes = premiosPendientes(usados, new Set([lotePremioReferido("AAA111")]));
    expect(pendientes).toEqual([
      { patenteReferidor: "AB1234", codigoAmigo: "BBB222", nombreLote: lotePremioReferido("BBB222") },
    ]);
  });

  it("el código usado en el mismo auto que lo recibió no premia", () => {
    const usados = [
      { codigo: "AAA111", nombreLote: loteReferido("AB1234"), patenteUso: "AB1234" },
      { codigo: "BBB222", nombreLote: loteReferido("AB1234"), patenteUso: "CD5678" },
    ];
    expect(premiosPendientes(usados, new Set()).map((p) => p.codigoAmigo)).toEqual(["BBB222"]);
  });
});

describe("rechazoCodigoReferido", () => {
  const codigo = { id: "c1", nombreLote: loteReferido("AB1234") };
  it("el dueño no lo usa en su auto; un amigo nuevo sí", () => {
    expect(rechazoCodigoReferido(codigo, "AB1234", [codigo])).toMatch(/amigo/);
    expect(rechazoCodigoReferido(codigo, "CD5678", [codigo])).toBeNull();
  });
  it("una patente usa un solo descuento de amigo (link o código)", () => {
    const otro = { id: "c2", nombreLote: loteReferido("ZZ9999"), patenteUso: "CD5678" };
    const link = { id: "c3", nombreLote: loteReferido("ZZ9999"), patenteAsignada: "EF9012" };
    expect(rechazoCodigoReferido(codigo, "CD5678", [codigo, otro])).toMatch(/ya usó/);
    expect(rechazoCodigoReferido(codigo, "EF9012", [codigo, link])).toMatch(/ya usó/);
  });
  it("no toca los cupones que no son de amigo", () => {
    expect(rechazoCodigoReferido({ id: "x", nombreLote: "Web - Primera vez" }, "AB1234", [])).toBeNull();
  });
});

describe("acumularPremio", () => {
  it("suma todos los premios previos, sin tope", () => {
    const previos = [
      { codigo: "A", valor: 2000 },
      { codigo: "B", valor: 4000 },
      { codigo: "C", valor: 2000 },
    ];
    expect(acumularPremio(2000, previos)).toEqual({ valor: 10000, absorbidos: ["A", "B", "C"] });
    expect(acumularPremio(2000, [])).toEqual({ valor: 2000, absorbidos: [] });
  });
});

describe("referidosDePatente", () => {
  it("cuenta solo los cupones de amigo de esa patente, y cuáles se usaron", () => {
    const cupones = [
      { nombreLote: loteReferido("AB1234"), usado: true },
      { nombreLote: loteReferido("AB1234"), usado: false, patenteAsignada: "CD5678" },
      // Código abierto que nadie tomó todavía: no es un amigo que llegó.
      { nombreLote: loteReferido("AB1234"), usado: false },
      { nombreLote: loteReferido("CD5678"), usado: true },
      { nombreLote: lotePremioReferido("XYZ"), usado: false },
    ];
    expect(referidosDePatente(cupones, "AB1234")).toEqual({ llegaron: 2, usaron: 1 });
    expect(referidosDePatente(cupones, "ZZ9999")).toEqual({ llegaron: 0, usaron: 0 });
  });
});

describe("premioAcumulado", () => {
  it("suma solo los premios vigentes sin usar de esa patente", () => {
    const ahora = new Date("2026-10-06T12:00:00Z");
    const premio = (patente: string, valor: number, usado = false, vence = "2026-11-01T00:00:00Z") => ({
      nombreLote: lotePremioReferido("AMIGO"),
      valor,
      usado,
      fechaCaducidad: vence,
      patenteAsignada: patente,
    });
    const cupones = [
      premio("AB1234", 8000),
      premio("AB1234", 2000),
      premio("AB1234", 4000, true), // absorbido o canjeado
      premio("AB1234", 2000, false, "2026-10-01T00:00:00Z"), // vencido
      premio("CD5678", 2000),
      { ...premio("AB1234", 2000), nombreLote: loteReferido("AB1234") }, // cupón del amigo, no premio
    ];
    expect(premioAcumulado(cupones, "AB1234", ahora)).toBe(10000);
    expect(premioAcumulado(cupones, "ZZ9999", ahora)).toBe(0);
  });
});
