import { describe, expect, it } from "vitest";
import { acumularPremio, loteReferido, lotePremioReferido, premioAcumulado, premiosPendientes, referidosDePatente, saltarInvitacionReferidos } from "./referidos";

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
