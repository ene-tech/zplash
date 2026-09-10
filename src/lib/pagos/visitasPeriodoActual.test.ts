import { describe, expect, it } from "vitest";
import { visitasPeriodoActual } from "./aplicarPagoAprobado";

// La ventana con que se decide si al cliente se le mantiene el plan (ver
// planTrasRenovacionSinCliente). Tiene que ser el ciclo que YA TERMINÓ, en las
// dos formas en que puede venir el vencimiento:
//
//   - el día anterior al aniversario, que es lo que escribe finCicloPlan;
//   - el aniversario exacto, que dejaron las vías que no restan ese día
//     (carga histórica, renovaciones viejas).
//
// Con la segunda, periodoPlan devolvía el ciclo SIGUIENTE —vacío— y el cliente
// medía 0 pasadas. En sep-2026 eso le habría mantenido el ilimitado a RTZP43,
// que usó 8. Si alguien saca el "-1 día" de visitasPeriodoActual, esto falla.

/** Fechas ISO interpoladas en la query, en orden (gte, lt). Recorrido con
 * `vistos` porque los objetos de drizzle son circulares (columna -> tabla). */
function fechasDe(cond: unknown): string[] {
  const out: string[] = [];
  const vistos = new WeakSet<object>();
  (function walk(v: unknown) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) out.push(v);
    if (typeof v !== "object" || v === null || vistos.has(v)) return;
    vistos.add(v);
    for (const x of Object.values(v)) walk(x);
  })(cond);
  return out;
}

function fakeDb(ingresos: string[]) {
  const chain = {
    from: () => chain,
    where: (cond: unknown) => {
      const [desde, hasta] = fechasDe(cond);
      return Promise.resolve(ingresos.filter((f) => f >= desde && f < hasta).map((f) => ({ id: f })));
    },
  };
  return { select: () => chain } as never;
}

describe("visitasPeriodoActual", () => {
  // Ciclo 3-ago -> 3-sep: ocho pasadas dentro, ninguna después.
  const ingresos = ["08-05", "08-08", "08-11", "08-15", "08-19", "08-24", "08-28", "09-01"].map((d) => `2026-${d}T15:00:00.000Z`);
  const cliente = { id: "c1", fechaContratacion: "2026-08-03T12:00:00.000Z" };

  it("cuenta el ciclo que terminó cuando el vencimiento es el aniversario", async () => {
    expect(await visitasPeriodoActual(fakeDb(ingresos), { ...cliente, vencimiento: "2026-09-03T12:00:00.000Z" })).toBe(8);
  });

  it("cuenta el mismo ciclo cuando el vencimiento es el día anterior", async () => {
    expect(await visitasPeriodoActual(fakeDb(ingresos), { ...cliente, vencimiento: "2026-09-02T12:00:00.000Z" })).toBe(8);
  });
});
