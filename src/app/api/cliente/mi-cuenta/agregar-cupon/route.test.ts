import { beforeEach, describe, expect, it, vi } from "vitest";

// Lo que se fija acá es a quién queda atado el código: un "descuento" tiene
// que quedar pegado a la patente de la cuenta (así el operador lo aplica sin
// tipearlo), un "vale" de Pack Empresa no (lo canjea cualquiera de la flota),
// y un código que ya está en otra cuenta no se puede robar.
const cuponEnBase: Record<string, unknown> = {};
const setGuardado = vi.fn();
const insertado = vi.fn();
// El UPDATE de la promo abierta lleva un NOT @> en el WHERE: `quemados` es lo
// que devuelve, y vacío significa "esta patente ya la había usado".
let quemados: { id: string }[] = [{ id: "cup1" }];
const fakeDb = {
  select: (cols?: unknown) =>
    cols
      ? // db.select({ codigo }).from(cupones): los códigos ya emitidos, para no repetir uno.
        { from: () => Promise.resolve([{ codigo: "AAAAAA" }]) }
      : { from: () => ({ where: () => ({ limit: () => Promise.resolve(cuponEnBase.fila ? [cuponEnBase.fila] : []) }) }) },
  update: () => ({
    set: (valores: unknown) => {
      setGuardado(valores);
      const where = () => Object.assign(Promise.resolve(), { returning: () => Promise.resolve(quemados) });
      return { where };
    },
  }),
  insert: () => ({ values: (fila: unknown) => { insertado(fila); return Promise.resolve(); } }),
  transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeDb),
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
    quemados = [{ id: "cup1" }];
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
  // Promo abierta (un uso por patente): la fila compartida sigue viva para el
  // resto — se le gasta el uso a esta patente y se emite un cupón propio.
  it("emite un cupón propio al guardar una promo de un uso por patente", async () => {
    fila({ tipo: "descuento", unUsoPorPatente: true, valor: 5000, esPorcentaje: false, nombreLote: "Alejandro" });
    const res = await pedir({ codigo: "K7M4PQ", patente: "AB1234" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, patenteAsignada: "AB1234" });
    expect(insertado).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "descuento", valor: 5000, patenteAsignada: "AB1234", email: "ana@ejemplo.cl", nombreLote: "Alejandro" })
    );
    // El código propio es nuevo: el compartido no se puede duplicar (UNIQUE).
    expect(insertado.mock.calls[0][0].codigo).not.toBe("K7M4PQ");
  });

  it("no emite dos veces si la patente ya usó la promo abierta", async () => {
    fila({ tipo: "descuento", unUsoPorPatente: true });
    quemados = [];
    const res = await pedir({ codigo: "K7M4PQ", patente: "AB1234" });

    expect(res.status).toBe(409);
    expect(insertado).not.toHaveBeenCalled();
  });

  it("pide un vehículo para guardar una promo abierta", async () => {
    fila({ tipo: "descuento", unUsoPorPatente: true });
    mockClientes.mockResolvedValue([]);
    const res = await pedir({ codigo: "K7M4PQ" });

    expect(res.status).toBe(400);
    expect(insertado).not.toHaveBeenCalled();
  });

  it("no ata a una patente con ficha un descuento de solo clientes nuevos", async () => {
    fila({ tipo: "descuento", soloClientesNuevos: true });
    const res = await pedir({ codigo: "K7M4PQ", patente: "AB1234" });

    expect(res.status).toBe(409);
    expect(setGuardado).not.toHaveBeenCalled();
  });

  // La invariante central de la promo abierta: la fila compartida solo puede
  // recibir el append de patentesUsadas. Si algún día se le estampa email o
  // patenteAsignada, se la saca del alcance de todos los demás clientes
  // (patenteAsignada es justo lo que resolverDescuento usa para rechazar).
  it("no le estampa dueño a la fila compartida de una promo abierta", async () => {
    fila({ tipo: "descuento", unUsoPorPatente: true, valor: 5000 });
    await pedir({ codigo: "K7M4PQ", patente: "AB1234" });

    for (const [valores] of setGuardado.mock.calls) {
      expect(Object.keys(valores as object)).toEqual(["patentesUsadas"]);
    }
  });

  it("no clona una promo abierta que ya es de otra patente", async () => {
    fila({ tipo: "descuento", unUsoPorPatente: true, patenteAsignada: "ZZ9999" });
    const res = await pedir({ codigo: "K7M4PQ", patente: "AB1234" });

    expect(res.status).toBe(409);
    expect(insertado).not.toHaveBeenCalled();
    expect(setGuardado).not.toHaveBeenCalled();
  });

  it("no guarda un vale que traiga la marca de promo abierta", async () => {
    fila({ tipo: "vale", unUsoPorPatente: true });
    const res = await pedir({ codigo: "K7M4PQ", patente: "AB1234" });

    expect(res.status).toBe(409);
    expect(setGuardado).not.toHaveBeenCalled();
  });

  // La patente de la ficha puede estar guardada sin normalizar; lo que se
  // escribe y compara acá viaja siempre por normPlate.
  it("normaliza la patente de la ficha antes de atar el descuento", async () => {
    fila({ tipo: "descuento" });
    mockClientes.mockResolvedValue([{ patente: "ab-1234" }]);
    const res = await pedir({ codigo: "K7M4PQ", patente: "AB1234" });

    expect(res.status).toBe(200);
    expect(setGuardado).toHaveBeenCalledWith({ email: "ana@ejemplo.cl", patenteAsignada: "AB1234" });
  });
});
