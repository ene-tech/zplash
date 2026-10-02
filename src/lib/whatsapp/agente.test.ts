import { describe, expect, it } from "vitest";
import { costoUsd } from "./agente";

describe("costoUsd", () => {
  it("cobra cada tipo de token a su precio por millón", () => {
    // Opus 5: 1M de cada tipo = 5 + 0,5 + 6,25 + 25.
    expect(costoUsd({ entrada: 1e6, cacheLeida: 1e6, cacheEscrita: 1e6, salida: 1e6 }, "claude-opus-5")).toBeCloseTo(36.75);
    expect(costoUsd({ entrada: 0, cacheLeida: 0, cacheEscrita: 0, salida: 1000 }, "claude-haiku-4-5")).toBeCloseTo(0.005);
  });
});
