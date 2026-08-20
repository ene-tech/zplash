import { describe, expect, it } from "vitest";
import { MAX_EDAD_FOTO_FILA_MS, fotoFilaFresca } from "./camara";

const AHORA = new Date("2026-08-18T15:00:00Z").getTime();
const haceMs = (ms: number) => new Date(AHORA - ms).toISOString();

describe("fotoFilaFresca", () => {
  it("acepta una foto recién subida", () => {
    expect(fotoFilaFresca(haceMs(5_000), AHORA)).toBe(true);
  });

  it("rechaza una foto vieja: el PC del local se apagó y la última quedó en el bucket", () => {
    expect(fotoFilaFresca(haceMs(MAX_EDAD_FOTO_FILA_MS + 1), AHORA)).toBe(false);
  });

  it("rechaza que no haya foto o que la fecha venga rota", () => {
    expect(fotoFilaFresca(null, AHORA)).toBe(false);
    expect(fotoFilaFresca("cualquier cosa", AHORA)).toBe(false);
  });
});
