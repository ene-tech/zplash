import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_ILIMITADO_LEGACY } from "@/lib/helpers";

// Lo que se fija acá: el cron diario no cobra dos veces al que ya pagó por
// otra vía, y la suscripción que el candado del X5 pausó vuelve sola a
// "activa" cuando ese candado deja de aplicar (renovó en el mesón). Antes
// quedaba pausada para siempre: sin cobro automático nunca más, en silencio.

let filas: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
const fakeDb = {
  select: () => ({
    from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve(filas) }) }) }),
  }),
  update: () => ({ set: (valores: Record<string, unknown>) => ({ where: () => updates.push(valores) }) }),
};
vi.mock("@/db", () => ({ getDb: () => fakeDb }));
vi.mock("@/lib/cron", () => ({ rechazoSiNoEsCron: () => null }));

const cobrarSuscripcion = vi.fn(() => Promise.resolve({ estado: "aprobada" }));
vi.mock("@/lib/pagos", () => ({ cobrarSuscripcion: () => cobrarSuscripcion() }));

import { GET } from "./route";

const enUnMes = new Date(Date.now() + 30 * 86400000).toISOString();
const ayer = new Date(Date.now() - 86400000).toISOString();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const correr = () => GET({} as any);

describe("GET /api/pagos/oneclick/cobrar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
  });

  it("plan vigente pagado por otra vía -> no cobra, reagenda al vencimiento", async () => {
    filas = [{ suscripcion: { id: "s1", patente: "AB1234", estado: "activa" }, plan: "Plan X5", aceptoX5En: null, vencimiento: enUnMes }];

    await correr();

    expect(cobrarSuscripcion).not.toHaveBeenCalled();
    expect(updates).toEqual([expect.objectContaining({ proximoCobro: enUnMes })]);
  });

  it("pausada por el candado del X5 y el cliente sigue en el ilimitado viejo -> no reactiva, pero pasa por cobrarSuscripcion (vuelve a pausar y avisa)", async () => {
    filas = [
      {
        suscripcion: { id: "s1", patente: "AB1234", estado: "pausada_validacion_x5" },
        plan: PLAN_ILIMITADO_LEGACY,
        aceptoX5En: null,
        vencimiento: ayer,
      },
    ];

    await correr();

    expect(cobrarSuscripcion).toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("pausada pero ya migrada al X5 (renovó en el mesón) -> vuelve a activa y se reagenda sin cobrar", async () => {
    filas = [
      { suscripcion: { id: "s1", patente: "AB1234", estado: "pausada_validacion_x5" }, plan: "Plan X5", aceptoX5En: null, vencimiento: enUnMes },
    ];

    await correr();

    expect(cobrarSuscripcion).not.toHaveBeenCalled();
    expect(updates).toEqual([expect.objectContaining({ estado: "activa" }), expect.objectContaining({ proximoCobro: enUnMes })]);
  });

  it("plan vencido -> cobra el ciclo", async () => {
    filas = [{ suscripcion: { id: "s1", patente: "AB1234", estado: "activa" }, plan: "Plan X5", aceptoX5En: null, vencimiento: ayer }];

    await correr();

    expect(cobrarSuscripcion).toHaveBeenCalled();
    expect(updates).toEqual([]);
  });
});
