import { describe, expect, it } from "vitest";
import { loteReferido, lotePremioReferido, premiosPendientes } from "./referidos";

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
