import { beforeEach, describe, expect, it, vi } from "vitest";

// Lo que se fija acá es a quién queda atado el código: un "descuento" tiene
// que quedar pegado a la patente de la cuenta (así el operador lo aplica sin
// tipearlo), un "vale" de Pack Empresa no (lo canjea cualquiera de la flota),
// y un código que ya está en otra cuenta no se puede robar.
const cuponEnBase: Record<string, unknown> = {};
const setGuardado = vi.fn();
const fakeDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(cuponEnBase.fila ? [cuponEnBase.fila] : []) }) }) }),
  update: () => ({
    set: (valores: unknown) => ({
      where: () => {
        setGuardado(valores);
        return Promise.resolve();
      },
    }),
  }),
};
vi.mock("@/db", () => ({ getDb: () => fakeDb }));

vi.mock("@/lib/auth/clienteSession", () => ({
  leerSesionCliente: () => Promise.resolve({ email: "Ana@Ejemplo.CL", clienteIds: ["c1"] }),
}));

const mockClientes = vi.fn();
vi.mock("@/lib/dataAccess/clientes", () => ({ getClientesByIds: () => mockClientes() }));

vi.mock("@/lib/rateLimit", () => ({ clienteIp: () => "1.2.3.4", rateLimited: () => false }));

import { POST } from "./route";

const vigente = new Date(Date.now() + 30 * 86400000).toISOString();

function fila(extra: Record<string, unknown>) {
  cuponEnBase.fila = { id: "cup1", codigo: "K7M4PQ", usado: false, fechaCaducidad: vigente, email: null, patenteAsignada: null, ...extra };
}

function pedir(body: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(new Request("https://zplash.cl/api/cliente/mi-cuenta/agregar-cupon", { method: "POST", body: JSON.stringify(body) }) as any);
}

describe("POST /api/cliente/mi-cuenta/agregar-cupon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientes.mockResolvedValue([{ patente: "AB1234" }]);
  });

  it("ata el descuento abierto al único vehículo de la cuenta", async () => {
    fila({ tipo: "descuento" });
    const res = await pedir({ codigo: " k7m4pq " });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, patenteAsignada: "AB1234" });
    expect(setGuardado).toHaveBeenCalledWith({ email: "ana@ejemplo.cl", patenteAsignada: "AB1234" });
  });

  it("no le pega patente a un ticket de Pack Empresa", async () => {
    fila({ tipo: "vale" });
    const res = await pedir({ codigo: "K7M4PQ", patente: "AB1234" });

    expect(res.status).toBe(200);
    expect(setGuardado).toHaveBeenCalledWith({ email: "ana@ejemplo.cl", patenteAsignada: null });
  });

  it("rechaza un código que ya está en otra cuenta", async () => {
    fila({ tipo: "vale", email: "otro@ejemplo.cl" });
    const res = await pedir({ codigo: "K7M4PQ" });

    expect(res.status).toBe(409);
    expect(setGuardado).not.toHaveBeenCalled();
  });

  it("rechaza un descuento asignado a una patente ajena", async () => {
    fila({ tipo: "descuento", patenteAsignada: "ZZ9999" });
    const res = await pedir({ codigo: "K7M4PQ" });

    expect(res.status).toBe(409);
    expect(setGuardado).not.toHaveBeenCalled();
  });

  it("rechaza un código vencido", async () => {
    fila({ tipo: "vale", fechaCaducidad: new Date(Date.now() - 86400000).toISOString() });
    const res = await pedir({ codigo: "K7M4PQ" });

    expect(res.status).toBe(409);
    expect(setGuardado).not.toHaveBeenCalled();
  });
});
