import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Si loadCore()+loadHistorial() disparan más queries en paralelo que el `max`
// del pool, postgres.js con prepare:false no encola: se cuelga para siempre y
// la app queda en "Cargando datos...". Ya pasó tres veces al agregar tablas
// (max 10 → 20 → 32 → 64). Ver el comentario en @/db/index.ts.
describe("pool de postgres", () => {
  it("tiene margen sobre las queries paralelas de loadAll", () => {
    const queries = (readFileSync("src/lib/dataAccess/loadAll.ts", "utf8").match(/safe\(db/g) ?? []).length;
    const max = Number(readFileSync("src/db/index.ts", "utf8").match(/max:\s*(\d+)/)![1]);
    expect(queries).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(queries);
  });
});
