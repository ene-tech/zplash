import { beforeEach, describe, expect, it, vi } from "vitest";

// Esta ruta es la que firma la cookie de sesión del Portal Cliente, y desde el
// registro de clientes nuevos además crea la ficha. Lo que se fija acá es esa
// puerta: que la ficha se cree solo después de verificar el código, que una
// patente con dueño no abra sesión, y que el login de siempre (sin nombre) no
// haya cambiado de comportamiento.

const { mockDb, filas } = vi.hoisted(() => {
  const filas: unknown[] = [];
  const mockDb = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(filas) }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };
  return { mockDb, filas };
});
vi.mock("@/db", () => ({ getDb: () => mockDb }));

const mockBuscarPorEmail = vi.fn();
const mockVincular = vi.fn();
vi.mock("@/lib/dataAccess/clientes", () => ({
  buscarClientesPorEmail: (e: string) => mockBuscarPorEmail(e),
  vincularPatenteACuenta: (...args: unknown[]) => mockVincular(...args),
}));

const mockCrearSesion = vi.fn();
vi.mock("@/lib/auth/clienteSession", () => ({
  crearSesionCliente: (ids: string[], email: string) => mockCrearSesion(ids, email),
}));

vi.mock("bcryptjs", () => ({ default: { compare: (codigo: string) => Promise.resolve(codigo === "123456") } }));
vi.mock("@/lib/csrf", () => ({ origenValido: () => true }));
vi.mock("@/lib/rateLimit", () => ({ clienteIp: () => "1.2.3.4", rateLimited: () => false }));

import { POST } from "./route";

function pedir(body: unknown) {
  return POST(
    new Request("https://zplash.cl/api/cliente/otp/verificar", {
      method: "POST",
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  );
}

describe("POST /api/cliente/otp/verificar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filas.length = 0;
    filas.push({
      id: "otp1",
      email: "nuevo@ejemplo.com",
      codigoHash: "hash",
      intentos: 0,
      expiraEn: new Date(Date.now() + 60_000).toISOString(),
      usadoEn: null,
    });
    mockBuscarPorEmail.mockResolvedValue([]);
    mockVincular.mockResolvedValue({ ok: true, clienteId: "c1" });
  });

  it("crea la ficha y abre sesión cuando el código es correcto (registro)", async () => {
    const res = await pedir({ solicitudId: "otp1", codigo: "123456", nombre: "Ana", patente: "AB1234" });
    expect(res.status).toBe(200);
    expect(mockVincular).toHaveBeenCalledWith("AB1234", "Ana", "nuevo@ejemplo.com", "Portal Cliente (Registro)");
    expect(mockCrearSesion).toHaveBeenCalledWith(["c1"], "nuevo@ejemplo.com");
  });

  it("no crea nada ni abre sesión si el código es incorrecto", async () => {
    const res = await pedir({ solicitudId: "otp1", codigo: "000000", nombre: "Ana", patente: "AB1234" });
    expect(res.status).toBe(400);
    expect(mockVincular).not.toHaveBeenCalled();
    expect(mockCrearSesion).not.toHaveBeenCalled();
  });

  it("no abre sesión si la patente tiene dueño activo", async () => {
    mockVincular.mockResolvedValue({ ok: false, error: "Esa patente ya está registrada." });
    const res = await pedir({ solicitudId: "otp1", codigo: "123456", nombre: "Ana", patente: "AB1234" });
    expect(res.status).toBe(409);
    expect(mockCrearSesion).not.toHaveBeenCalled();
  });

  it("rechaza el registro con patente inválida antes de tocar la base", async () => {
    const res = await pedir({ solicitudId: "otp1", codigo: "123456", nombre: "Ana", patente: "XX" });
    expect(res.status).toBe(400);
    expect(mockVincular).not.toHaveBeenCalled();
  });

  it("sin nombre sigue siendo login: correo sin vehículos no abre sesión", async () => {
    const res = await pedir({ solicitudId: "otp1", codigo: "123456" });
    expect(res.status).toBe(404);
    expect(mockVincular).not.toHaveBeenCalled();
    expect(mockCrearSesion).not.toHaveBeenCalled();
  });

  it("sin nombre y con vehículos, abre sesión con todos ellos", async () => {
    mockBuscarPorEmail.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    const res = await pedir({ solicitudId: "otp1", codigo: "123456" });
    expect(res.status).toBe(200);
    expect(mockCrearSesion).toHaveBeenCalledWith(["c1", "c2"], "nuevo@ejemplo.com");
  });
});
