import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_ILIMITADO_LEGACY, PLAN_X5 } from "@/lib/helpers";

// Lo que se fija acá: el candado del paso al X5. Al cliente del ilimitado
// viejo que no aceptó el cambio no se le cobra (no se llama a Transbank, la
// suscripción queda pausada) y se le avisa por correo con su propio evento,
// no con el de "cobro fallido" — su tarjeta está bien.

let respuestas: unknown[][] = [];
const updates: Record<string, unknown>[] = [];
const chain = {
  from: () => chain,
  where: () => chain,
  limit: () => Promise.resolve(respuestas.shift() ?? []),
};
const fakeTx = {
  execute: () => Promise.resolve(),
  select: () => chain,
  insert: () => ({ values: () => Promise.resolve() }),
  update: () => ({
    set: (valores: Record<string, unknown>) => ({
      where: () => {
        updates.push(valores);
        return Promise.resolve();
      },
    }),
  }),
  transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx),
};
vi.mock("@/db", () => ({ getDb: () => ({ transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx) }) }));
// after() fuera de un request de Next tira error: acá se ejecuta al toque.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

const authorize = vi.fn(() => Promise.resolve({ details: [{ response_code: 0, authorization_code: "a1" }] }));
vi.mock("@/lib/transbank", () => ({
  oneclickTransaction: () => ({ authorize: () => authorize() }),
  oneclickChildCommerceCode: () => "597055555542",
}));

const avisoValidacionX5 = vi.fn(() => Promise.resolve());
const avisoCobroFallido = vi.fn(() => Promise.resolve());
vi.mock("@/lib/mailing/reglas", () => ({
  evaluarReglasCorreoPorCobroFallido: () => avisoCobroFallido(),
  evaluarReglasCorreoPorValidacionX5: () => avisoValidacionX5(),
}));
vi.mock("@/lib/whatsapp/reglas", () => ({ evaluarReglasPorCobroFallido: () => Promise.resolve() }));
vi.mock("./aplicarPagoAprobado", () => ({ aplicarPagoAprobado: () => Promise.resolve({}) }));
vi.mock("./cuponPlan", () => ({ buscarCuponDescuentoPlan: () => Promise.resolve(null) }));

import { cobrarSuscripcion } from "./cobrarSuscripcion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const suscripcion = { id: "s1", patente: "AB1234", username: "AB1234", tbkUser: "tbk1", proximoCobro: "2026-09-01T00:00:00.000Z", clienteId: null } as any;

describe("cobrarSuscripcion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
  });

  it("cliente del ilimitado viejo que no aceptó el X5 -> no cobra, pausa y avisa por su propio evento", async () => {
    respuestas = [
      [{ plan: PLAN_X5, normal: 21990, promo: 19990 }],
      [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: null }],
    ];

    const { estado } = await cobrarSuscripcion(suscripcion);

    expect(estado).toBe("pendiente_validacion");
    expect(authorize).not.toHaveBeenCalled();
    expect(updates).toEqual([expect.objectContaining({ estado: "pausada_validacion_x5" })]);
    expect(avisoValidacionX5).toHaveBeenCalled();
    expect(avisoCobroFallido).not.toHaveBeenCalled();
  });

  it("mismo cliente pero ya aceptó el X5 -> cobra normal y no avisa nada", async () => {
    respuestas = [
      [{ plan: PLAN_X5, normal: 21990, promo: 19990 }],
      [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: "2026-09-01T00:00:00.000Z" }],
      [], // ningún cobro aprobado este ciclo
    ];

    const { estado } = await cobrarSuscripcion(suscripcion);

    expect(estado).toBe("aprobada");
    expect(authorize).toHaveBeenCalled();
    expect(avisoValidacionX5).not.toHaveBeenCalled();
    expect(avisoCobroFallido).not.toHaveBeenCalled();
  });
});
