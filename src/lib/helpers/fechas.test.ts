import { describe, expect, it } from "vitest";
import { finDelDiaSantiago, fmtCaducidad } from "./fechas";

describe("finDelDiaSantiago", () => {
  it("lleva un instante a las 23:59:59 de su día en Chile (horario de verano, UTC-3)", () => {
    // 4-nov-2026 15:00 de Chile.
    expect(finDelDiaSantiago(new Date("2026-11-04T18:00:00.000Z"))).toBe("2026-11-05T02:59:59.000Z");
  });

  it("usa el día de Chile y no el de UTC: las 22:00 de Chile ya son el día siguiente en UTC", () => {
    expect(finDelDiaSantiago(new Date("2026-11-05T01:00:00.000Z"))).toBe("2026-11-05T02:59:59.000Z");
  });

  it("en horario de invierno (UTC-4)", () => {
    expect(finDelDiaSantiago(new Date("2026-06-10T15:00:00.000Z"))).toBe("2026-06-11T03:59:59.000Z");
  });

  it("es idempotente", () => {
    const fin = finDelDiaSantiago(new Date("2026-11-04T18:00:00.000Z"));
    expect(finDelDiaSantiago(new Date(fin))).toBe(fin);
  });
});

describe("fmtCaducidad", () => {
  it("muestra el día de Chile del 23:59:59, no el día UTC siguiente", () => {
    expect(fmtCaducidad("2026-11-05T02:59:59.000Z")).toBe("04-11-2026");
  });
});
