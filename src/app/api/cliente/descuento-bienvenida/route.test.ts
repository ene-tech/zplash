import { beforeEach, describe, expect, it, vi } from "vitest";

// Ruta pública que reparte plata (emite cupones de descuento), así que lo que
// se fija acá es la puerta: que un cliente ya registrado no pueda sacar el
// descuento de primera vez, y que un fallo del correo no invalide un cupón
// que ya quedó emitido en la base.
const mockBuscarClientePorPatente = vi.fn();
vi.mock("@/lib/dataAccess/clientes", () => ({
  buscarClientePorPatente: (p: string) => mockBuscarClientePorPatente(p),
}));

const mockEmitirCupon = vi.fn();
vi.mock("@/lib/dataAccess", () => ({
  emitirCuponDescuentoPrimeraVez: (opts: unknown) => mockEmitirCupon(opts),
  getConfig: () => Promise.resolve({ descuentoPrimeraVezValor: 3000, descuentoPrimeraVezDiasValidez: 7 }),
}));

const mockEnviar = vi.fn();
vi.mock("@/lib/mailing/proveedor", () => ({
  enviarCorreoTransaccional: (envio: unknown) => mockEnviar(envio),
}));

vi.mock("@/lib/csrf", () => ({ origenValido: () => true }));
vi.mock("@/lib/rateLimit", () => ({ clienteIp: () => "1.2.3.4", rateLimited: () => false }));

import { POST } from "./route";

function pedir(body: unknown) {
  return POST(
    new Request("https://zplash.cl/api/cliente/descuento-bienvenida", {
      method: "POST",
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  );
}

describe("POST /api/cliente/descuento-bienvenida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuscarClientePorPatente.mockResolvedValue(null);
    mockEnviar.mockResolvedValue({ ok: true });
    mockEmitirCupon.mockResolvedValue({
      codigo: "ABC234",
      valor: 3000,
      fechaCaducidad: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  });

  it("emite el cupón con el monto y la vigencia de la config", async () => {
    const res = await pedir({ patente: "ab1234", email: "Nuevo@Ejemplo.CL" });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ ok: true, codigo: "ABC234", correoEnviado: true });
    expect(mockEmitirCupon).toHaveBeenCalledWith(
      expect.objectContaining({ patente: "AB1234", valor: 3000, diasValidez: 7 })
    );
    expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({ to: "nuevo@ejemplo.cl" }));
  });

  it("no emite nada si la patente ya es de un cliente", async () => {
    mockBuscarClientePorPatente.mockResolvedValue({ id: "c1", patente: "AB1234" });

    const res = await pedir({ patente: "AB1234", email: "nuevo@ejemplo.cl" });

    expect(res.status).toBe(409);
    expect(mockEmitirCupon).not.toHaveBeenCalled();
    expect(mockEnviar).not.toHaveBeenCalled();
  });

  it("rechaza patente o correo inválidos sin tocar la base", async () => {
    expect((await pedir({ patente: "XX", email: "nuevo@ejemplo.cl" })).status).toBe(400);
    expect((await pedir({ patente: "AB1234", email: "no-es-mail" })).status).toBe(400);
    expect(mockEmitirCupon).not.toHaveBeenCalled();
  });

  it("devuelve el código igual si el correo no sale", async () => {
    mockEnviar.mockResolvedValue({ ok: false, error: "no configurado" });

    const res = await pedir({ patente: "AB1234", email: "nuevo@ejemplo.cl" });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ ok: true, codigo: "ABC234", correoEnviado: false });
  });
});
