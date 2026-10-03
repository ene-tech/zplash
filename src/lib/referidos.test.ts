import { describe, expect, it } from "vitest";
import { acumularPremio, loteReferido, lotePremioReferido, premiosPendientes, saltarInvitacionReferidos } from "./referidos";

describe("saltarInvitacionReferidos (fin de semana post campaña)", () => {
  const sabado = new Date("2026-10-03T15:00:00Z");
  it("salta al cliente que ya estaba en la base, no al nuevo ni a otras plantillas", () => {
    expect(saltarInvitacionReferidos("wa-lavado-unico-referidos", "2026-05-01T00:00:00Z", sabado)).toBe(true);
    expect(saltarInvitacionReferidos("wa-lavado-unico-referidos", "2026-10-03T14:00:00Z", sabado)).toBe(false);
    expect(saltarInvitacionReferidos("wa-compra-confirmada", "2026-05-01T00:00:00Z", sabado)).toBe(false);
  });
  it("desde el lunes 00:00 Chile vuelve a lo normal", () => {
    expect(saltarInvitacionReferidos("wa-lavado-unico-referidos", "2026-05-01T00:00:00Z", new Date("2026-10-05T03:00:00Z"))).toBe(false);
  });
});

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
});

describe("acumularPremio", () => {
  it("suma los premios previos hasta el tope y deja afuera el que no entra", () => {
    const previos = [
      { codigo: "A", valor: 2000 },
      { codigo: "B", valor: 4000 },
      { codigo: "C", valor: 2000 },
    ];
    expect(acumularPremio(2000, previos, 8000)).toEqual({ valor: 8000, absorbidos: ["A", "B"] });
    expect(acumularPremio(2000, [], 8000)).toEqual({ valor: 2000, absorbidos: [] });
    expect(acumularPremio(2000, [{ codigo: "X", valor: 8000 }], 8000)).toEqual({ valor: 2000, absorbidos: [] });
  });
});
