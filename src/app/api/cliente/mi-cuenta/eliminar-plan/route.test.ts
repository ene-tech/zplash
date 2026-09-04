import { beforeEach, describe, expect, it, vi } from "vitest";

// Lo que se fija acá es quién puede darse de baja solo. Este endpoint solo
// cancela Oneclick: si al cliente lo sigue cobrando WooCommerce Subscriptions
// (renovacionAutoWooDesde), borrarle el plan lo dejaría "Sin plan" mientras
// WordPress le sigue pasando la tarjeta todos los meses.
let suscripciones: { id: string; estado: string }[] = [];
const setGuardado = vi.fn();
const fakeDb = {
  select: () => ({ from: () => ({ where: () => Promise.resolve(suscripciones) }) }),
  update: () => ({
    set: (valores: unknown) => {
      setGuardado(valores);
      return { where: () => Promise.resolve() };
    },
  }),
};
vi.mock("@/db", () => ({ getDb: () => fakeDb }));

vi.mock("@/lib/auth/clienteSession", () => ({
  leerSesionCliente: () => Promise.resolve({ email: "ana@ejemplo.cl", clienteIds: ["c1"] }),
}));

const mockClientes = vi.fn();
vi.mock("@/lib/dataAccess/clientes", () => ({ getClientesByIds: () => mockClientes() }));

const cancelada = vi.fn();
vi.mock("@/lib/dataAccess/oneclick", () => ({
  cancelarSuscripcionOneclick: (id: string) => {
    cancelada(id);
    return Promise.resolve(true);
  },
}));

vi.mock("@/lib/dataAccess/auditoria", () => ({ insertAuditoria: () => Promise.resolve() }));

import { POST } from "./route";

const vencido = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
const vigente = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

function cliente(extra: Record<string, unknown> = {}) {
  mockClientes.mockResolvedValue([
    {
      id: "c1",
      patente: "AB1234",
      plan: "Plan X5",
      vencimiento: vencido,
      fechaContratacion: "2026-01-01",
      precioPlanHeredado: 12000,
      renovacionAutoWooDesde: null,
      ...extra,
    },
  ]);
}

function pedir(patente = "AB1234") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(new Request("https://zplash.cl/api/cliente/mi-cuenta/eliminar-plan", { method: "POST", body: JSON.stringify({ patente }) }) as any);
}

describe("POST /api/cliente/mi-cuenta/eliminar-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suscripciones = [];
    cliente();
  });

  it("da de baja el plan vencido y cancela la tarjeta guardada", async () => {
    suscripciones = [{ id: "s1", estado: "activa" }];
    const res = await pedir();

    expect(res.status).toBe(200);
    expect(setGuardado).toHaveBeenCalledWith({ plan: null, vencimiento: null, fechaContratacion: null, precioPlanHeredado: null });
    expect(cancelada).toHaveBeenCalledWith("s1");
  });

  it("no deja borrar el plan mientras lo cobre WooCommerce", async () => {
    cliente({ renovacionAutoWooDesde: "2025-03-10" });
    const res = await pedir();

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("+569 3230110");
    expect(setGuardado).not.toHaveBeenCalled();
    expect(cancelada).not.toHaveBeenCalled();
  });

  it("sí deja al cliente Woo que ya migró a una tarjeta Oneclick activa", async () => {
    cliente({ renovacionAutoWooDesde: "2025-03-10" });
    suscripciones = [{ id: "s1", estado: "activa" }];
    const res = await pedir();

    expect(res.status).toBe(200);
    expect(cancelada).toHaveBeenCalledWith("s1");
  });

  it("no deja darse de baja con el plan todavía vigente", async () => {
    cliente({ vencimiento: vigente });
    const res = await pedir();

    expect(res.status).toBe(400);
    expect(setGuardado).not.toHaveBeenCalled();
  });
});
